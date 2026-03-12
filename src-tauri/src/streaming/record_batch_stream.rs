use arrow_array::RecordBatch;
use datafusion::physical_plan::SendableRecordBatchStream;
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::error::Result;
use crate::state::active_queries;
use crate::streaming::result_serializer::serialize_batch_to_rows;

/// A single streamed chunk event payload.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamChunk {
    pub query_id: String,
    pub chunk_index: usize,
    pub columns: Vec<String>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub row_count: usize,
    pub done: bool,
}

/// Streams DataFusion record batches to the frontend via Tauri events.
///
/// Each chunk is emitted as `query-chunk-{query_id}`.
/// A final event with `done: true` signals stream completion.
/// On error, `query-error-{query_id}` is emitted.
/// If the query is cancelled, streaming stops immediately.
pub async fn stream_to_frontend(
    app: AppHandle,
    query_id: String,
    mut stream: SendableRecordBatchStream,
    chunk_size: usize,
) -> Result<()> {
    let schema = stream.schema();
    let columns: Vec<String> = schema.fields().iter().map(|f| f.name().clone()).collect();

    let mut buffer: Vec<RecordBatch> = Vec::new();
    let mut buffered_rows = 0usize;
    let mut chunk_index = 0usize;

    while let Some(batch_result) = stream.next().await {
        // Check if query was cancelled
        if active_queries::is_cancelled(&query_id) {
            // Send cancellation message and stop
            let _ = app.emit(&format!("query-chunk-{}", query_id), StreamChunk {
                query_id: query_id.clone(),
                chunk_index,
                columns: columns.clone(),
                rows: vec![],
                row_count: 0,
                done: true,
            });
            return Ok(());
        }

        let batch = batch_result.map_err(|e| crate::error::AppError::QueryError(e.to_string()))?;
        buffered_rows += batch.num_rows();
        buffer.push(batch);

        if buffered_rows >= chunk_size {
            let rows = collect_rows(&buffer, &columns)?;
            let chunk = StreamChunk {
                query_id: query_id.clone(),
                chunk_index,
                columns: columns.clone(),
                row_count: rows.len(),
                rows,
                done: false,
            };
            let _ = app.emit(&format!("query-chunk-{}", query_id), &chunk);
            chunk_index += 1;
            buffer.clear();
            buffered_rows = 0;
        }
    }

    // Flush remaining rows
    if !buffer.is_empty() {
        let rows = collect_rows(&buffer, &columns)?;
        let chunk = StreamChunk {
            query_id: query_id.clone(),
            chunk_index,
            columns: columns.clone(),
            row_count: rows.len(),
            rows,
            done: false,
        };
        let _ = app.emit(&format!("query-chunk-{}", query_id), &chunk);
    }

    // Emit completion signal
    let done_chunk = StreamChunk {
        query_id: query_id.clone(),
        chunk_index: chunk_index + 1,
        columns,
        rows: vec![],
        row_count: 0,
        done: true,
    };
    let _ = app.emit(&format!("query-chunk-{}", query_id), &done_chunk);

    Ok(())
}

fn collect_rows(
    batches: &[RecordBatch],
    columns: &[String],
) -> Result<Vec<Vec<serde_json::Value>>> {
    let mut rows = Vec::new();
    for batch in batches {
        let batch_rows = serialize_batch_to_rows(batch, columns)?;
        rows.extend(batch_rows);
    }
    Ok(rows)
}
