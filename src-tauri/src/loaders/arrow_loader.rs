use std::fs::File;
use std::io::BufReader;

use arrow_ipc::reader::FileReader as ArrowFileReader;
use arrow_schema::SchemaRef;

use crate::error::{AppError, Result};
use crate::loaders::{DatasetLoader, LoaderPreview};
use crate::streaming::result_serializer::serialize_batches;

pub struct ArrowLoader;

#[async_trait::async_trait]
impl DatasetLoader for ArrowLoader {
    async fn load_preview(&self, path: &str, limit: usize) -> Result<LoaderPreview> {
        let path = path.to_string();
        tokio::task::spawn_blocking(move || {
            let file = File::open(&path)
                .map_err(|e| AppError::InvalidFilePath(e.to_string()))?;
            let reader = ArrowFileReader::try_new(BufReader::new(file), None)
                .map_err(|e| AppError::DataLoadError(e.to_string()))?;

            let schema = reader.schema();
            let columns: Vec<String> = schema.fields().iter().map(|f| f.name().clone()).collect();
            let column_types: Vec<String> = schema
                .fields()
                .iter()
                .map(|f| crate::engine::schema_manager::format_data_type(f.data_type()))
                .collect();

            let mut batches = Vec::new();
            let mut total_rows = 0usize;
            for batch in reader {
                let batch = batch.map_err(|e| AppError::DataLoadError(e.to_string()))?;
                total_rows += batch.num_rows();
                if total_rows <= limit + batch.num_rows() {
                    batches.push(batch);
                }
                if total_rows >= limit {
                    break;
                }
            }

            let result = serialize_batches(&batches, 0)?;
            Ok(LoaderPreview {
                columns,
                column_types,
                rows: result.rows.into_iter().take(limit).collect(),
                row_count: result.row_count.min(limit),
                total_rows: None,
            })
        })
        .await
        .map_err(|e| AppError::DataLoadError(e.to_string()))?
    }

    async fn infer_schema(&self, path: &str) -> Result<String> {
        let path = path.to_string();
        tokio::task::spawn_blocking(move || {
            let file = File::open(&path)
                .map_err(|e| AppError::InvalidFilePath(e.to_string()))?;
            let reader = ArrowFileReader::try_new(BufReader::new(file), None)
                .map_err(|e| AppError::DataLoadError(e.to_string()))?;

            let schema: SchemaRef = reader.schema();
            let fields: Vec<serde_json::Value> = schema
                .fields()
                .iter()
                .map(|f| {
                    serde_json::json!({
                        "name": f.name(),
                        "data_type": format!("{}", f.data_type()),
                        "nullable": f.is_nullable()
                    })
                })
                .collect();
            Ok(serde_json::to_string(&fields)?)
        })
        .await
        .map_err(|e| AppError::DataLoadError(e.to_string()))?
    }

    async fn count_rows(&self, path: &str) -> Result<u64> {
        let path = path.to_string();
        tokio::task::spawn_blocking(move || {
            let file = File::open(&path)
                .map_err(|e| AppError::InvalidFilePath(e.to_string()))?;
            let reader = ArrowFileReader::try_new(BufReader::new(file), None)
                .map_err(|e| AppError::DataLoadError(e.to_string()))?;

            let mut count = 0u64;
            for batch in reader {
                let batch = batch.map_err(|e| AppError::DataLoadError(e.to_string()))?;
                count += batch.num_rows() as u64;
            }
            Ok(count)
        })
        .await
        .map_err(|e| AppError::DataLoadError(e.to_string()))?
    }
}

/// Read all batches from an Arrow IPC file, for query engine registration.
pub fn read_all_batches(path: &str) -> Result<(Vec<arrow_array::RecordBatch>, SchemaRef)> {
    let file = File::open(path)
        .map_err(|e| AppError::InvalidFilePath(e.to_string()))?;
    let reader = ArrowFileReader::try_new(BufReader::new(file), None)
        .map_err(|e| AppError::DataLoadError(e.to_string()))?;
    let schema = reader.schema();
    let mut batches = Vec::new();
    for batch in reader {
        batches.push(batch.map_err(|e| AppError::DataLoadError(e.to_string()))?);
    }
    Ok((batches, schema))
}
