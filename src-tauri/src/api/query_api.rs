use std::sync::Arc;

use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::engine::dataset_registry::DatasetRegistry;
use crate::engine::query_engine::QueryEngine;
use crate::error::{AppError, Result};
use crate::state::active_queries;
use crate::streaming::record_batch_stream::stream_to_frontend;
use crate::streaming::result_serializer::QueryResult;

/// Query history stored in-process (reset on restart).
static HISTORY: once_cell::sync::Lazy<parking_lot::Mutex<Vec<HistoryEntry>>> =
    once_cell::sync::Lazy::new(|| parking_lot::Mutex::new(Vec::new()));

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct HistoryEntry {
    pub id: String,
    pub sql: String,
    pub executed_at: String,
    pub elapsed_ms: Option<u64>,
    pub row_count: Option<usize>,
    pub error: Option<String>,
}

/// Execute a SQL query and return all results at once.
#[tauri::command]
pub async fn run_query(
    sql: String,
    registry: State<'_, Arc<DatasetRegistry>>,
) -> Result<QueryResult> {
    if sql.trim().is_empty() {
        return Err(AppError::QuerySyntaxError("Query cannot be empty".to_string()));
    }

    let engine = QueryEngine::new(registry.inner().clone());
    let result = engine.execute_query(&sql).await?;

    record_history(&sql, Some(result.elapsed_ms), Some(result.row_count), None);

    Ok(result)
}

/// Execute a SQL query and stream results back as Tauri events.
/// Returns the query_id immediately; frontend listens for `query-chunk-{query_id}`.
#[tauri::command]
pub async fn run_query_streaming(
    sql: String,
    chunk_size: Option<usize>,
    app: AppHandle,
    registry: State<'_, Arc<DatasetRegistry>>,
) -> Result<String> {
    if sql.trim().is_empty() {
        return Err(AppError::QuerySyntaxError("Query cannot be empty".to_string()));
    }

    let query_id = Uuid::new_v4().to_string();
    let chunk_size = chunk_size.unwrap_or(500);
    let registry_clone = registry.inner().clone();
    let app_clone = app.clone();
    let qid = query_id.clone();
    let sql_clone = sql.clone();

    // Register the query
    active_queries::register_query(&qid);
    let qid_cleanup = qid.clone();

    tokio::spawn(async move {
        let engine = QueryEngine::new(registry_clone);

        // Check if cancelled before starting
        if active_queries::is_cancelled(&qid) {
            let _ = tauri::Emitter::emit(
                &app_clone,
                &format!("query-error-{}", qid),
                AppError::QueryCancelled.to_response(Some(sql_clone.clone())),
            );
            active_queries::cleanup(&qid_cleanup);
            return;
        }

        match engine.execute_streaming(&sql_clone).await {
            Ok(df) => {
                match df.execute_stream().await {
                    Ok(stream) => {
                        if let Err(e) = stream_to_frontend(app_clone.clone(), qid.clone(), stream, chunk_size).await {
                            let _ = tauri::Emitter::emit(
                                &app_clone,
                                &format!("query-error-{}", qid),
                                e.to_response(Some(sql_clone.clone())),
                            );
                        } else {
                            active_queries::complete(&qid);
                        }
                    }
                    Err(e) => {
                        let app_err = AppError::QueryError(e.to_string());
                        let _ = tauri::Emitter::emit(
                            &app_clone,
                            &format!("query-error-{}", qid),
                            app_err.to_response(Some(sql_clone.clone())),
                        );
                    }
                }
            }
            Err(e) => {
                let _ = tauri::Emitter::emit(
                    &app_clone,
                    &format!("query-error-{}", qid),
                    e.to_response(Some(sql_clone.clone())),
                );
            }
        }

        // Clean up query state
        active_queries::cleanup(&qid_cleanup);
    });

    record_history(&sql, None, None, None);
    Ok(query_id)
}

/// Cancel a streaming query.
/// Sets a flag that the streaming endpoint checks to stop sending results.
#[tauri::command]
pub async fn cancel_query(query_id: String) -> Result<()> {
    active_queries::cancel(&query_id);
    Ok(())
}

/// Return the in-memory query history (most recent first).
#[tauri::command]
pub async fn get_query_history() -> Result<Vec<HistoryEntry>> {
    let lock = HISTORY.lock();
    let mut entries = lock.clone();
    entries.reverse();
    Ok(entries)
}

fn record_history(
    sql: &str,
    elapsed_ms: Option<u64>,
    row_count: Option<usize>,
    error: Option<String>,
) {
    let entry = HistoryEntry {
        id: Uuid::new_v4().to_string(),
        sql: sql.to_string(),
        executed_at: chrono::Utc::now().to_rfc3339(),
        elapsed_ms,
        row_count,
        error,
    };
    let mut lock = HISTORY.lock();
    lock.push(entry);
    // Keep at most 200 entries
    if lock.len() > 200 {
        lock.remove(0);
    }
}
