use std::sync::Arc;

use tauri::State;

use crate::engine::dataset_registry::DatasetRegistry;
use crate::engine::schema_manager::DatasetSchema;
use crate::engine::statistics_engine::{ColumnStats, DatasetStats, StatisticsEngine};
use crate::error::{AppError, Result};

/// Get the Arrow schema for a dataset.
#[tauri::command]
pub async fn get_schema(
    id: String,
    registry: State<'_, Arc<DatasetRegistry>>,
) -> Result<DatasetSchema> {
    use datafusion::prelude::*;
    use crate::engine::dataset_registry::FileType;

    let info = registry
        .get(&id)
        .ok_or_else(|| AppError::DatasetNotFound(id.clone()))?;

    let ctx = SessionContext::new();
    let table_name = sanitize_table_name(&info.name);

    match info.file_type {
        FileType::Csv => {
            ctx.register_csv(&table_name, &info.source_path, CsvReadOptions::new())
                .await
                .map_err(|e| AppError::SchemaError(e.to_string()))?;
        }
        FileType::Parquet => {
            ctx.register_parquet(&table_name, &info.source_path, ParquetReadOptions::default())
                .await
                .map_err(|e| AppError::SchemaError(e.to_string()))?;
        }
        FileType::Json => {
            ctx.register_json(&table_name, &info.source_path, NdJsonReadOptions::default())
                .await
                .map_err(|e| AppError::SchemaError(e.to_string()))?;
        }
        FileType::Arrow => {
            use crate::loaders::arrow_loader::read_all_batches;
            use datafusion::datasource::MemTable;
            use std::sync::Arc;
            if let Ok((batches, schema)) = read_all_batches(&info.source_path) {
                if let Ok(mem_table) = MemTable::try_new(schema, vec![batches]) {
                    let _ = ctx.register_table(&table_name, Arc::new(mem_table));
                }
            } else {
                return Err(AppError::UnsupportedFormat(
                    "Failed to read Arrow IPC file".to_string(),
                ));
            }
        }
    }

    let df = ctx
        .sql(&format!("SELECT * FROM \"{}\" LIMIT 0", table_name))
        .await
        .map_err(|e| AppError::QueryError(e.to_string()))?;

    // LIMIT 0 can legitimately return no record batches, so derive the schema
    // directly from the DataFrame logical schema instead.
    let arrow_schema = df.schema().as_arrow().clone();

    Ok(DatasetSchema::from_arrow(&id, &arrow_schema))
}

/// Get full statistics for a dataset.
#[tauri::command]
pub async fn get_statistics(
    id: String,
    registry: State<'_, Arc<DatasetRegistry>>,
) -> Result<DatasetStats> {
    let engine = StatisticsEngine::new(registry.inner().clone());
    engine.compute_stats(&id).await
}

/// Get statistics for a specific column.
#[tauri::command]
pub async fn get_column_stats(
    dataset_id: String,
    column_name: String,
    registry: State<'_, Arc<DatasetRegistry>>,
) -> Result<ColumnStats> {
    let stats = get_statistics(dataset_id, registry).await?;
    stats
        .column_stats
        .into_iter()
        .find(|c| c.column_name == column_name)
        .ok_or_else(|| AppError::SchemaError(format!("Column not found: {}", column_name)))
}

fn sanitize_table_name(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() || c == '_' { c } else { '_' })
        .collect::<String>()
        .to_lowercase()
}
