use std::sync::Arc;

use tauri::State;

use crate::engine::database_executor::DatabaseExecutor;
use crate::engine::database_registry::DatabaseRegistry;
use crate::engine::dataset_registry::DatasetRegistry;
use crate::engine::query_engine::QueryEngine;
use crate::error::{AppError, Result};
use crate::streaming::result_serializer::QueryResult;

#[derive(Debug, serde::Deserialize, serde::Serialize, Clone, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Csv,
    Json,
    Parquet,
}

/// Export the results of a SQL query to a file in the chosen format.
///
/// Routes to the same backend the query would run against — an external
/// database when `connection_id` is set, otherwise DataFusion on loaded
/// datasets — and exports the FULL result set (no display row cap).
/// Returns the number of rows exported.
#[tauri::command]
pub async fn export_query_results(
    sql: String,
    dest_path: String,
    format: ExportFormat,
    connection_id: Option<String>,
    registry: State<'_, Arc<DatasetRegistry>>,
    db_registry: State<'_, Arc<DatabaseRegistry>>,
) -> Result<u64> {
    if sql.trim().is_empty() {
        return Err(AppError::QuerySyntaxError("Query cannot be empty".to_string()));
    }

    let result = match connection_id {
        Some(id) => {
            let executor = DatabaseExecutor::from_registry(db_registry.inner().clone(), &id)?;
            executor.fetch_all(&sql).await?
        }
        None => QueryEngine::new(registry.inner().clone()).execute_query(&sql).await?,
    };
    let row_count = result.row_count as u64;

    match format {
        ExportFormat::Csv => export_as_csv(&result, &dest_path).await?,
        ExportFormat::Json => export_as_json(&result, &dest_path).await?,
        ExportFormat::Parquet => {
            // Parquet writing is CPU + blocking I/O — run off the async runtime.
            let path = dest_path.clone();
            tokio::task::spawn_blocking(move || export_result_as_parquet(&result, &path))
                .await
                .map_err(|e| AppError::ExportError(format!("export task failed: {e}")))??;
        }
    }

    Ok(row_count)
}

/// Export a pre-computed QueryResult as CSV.
async fn export_as_csv(
    result: &crate::streaming::result_serializer::QueryResult,
    path: &str,
) -> Result<()> {
    let mut content = String::new();

    // Header row
    content.push_str(&result.columns.join(","));
    content.push('\n');

    // Data rows
    for row in &result.rows {
        let cells: Vec<String> = row
            .iter()
            .map(|v| {
                let s = match v {
                    serde_json::Value::Null => String::new(),
                    serde_json::Value::String(s) => {
                        if s.contains(',') || s.contains('"') || s.contains('\n') {
                            format!("\"{}\"", s.replace('"', "\"\""))
                        } else {
                            s.clone()
                        }
                    }
                    other => other.to_string(),
                };
                s
            })
            .collect();
        content.push_str(&cells.join(","));
        content.push('\n');
    }

    tokio::fs::write(path, content)
        .await
        .map_err(|e| AppError::ExportError(e.to_string()))?;
    Ok(())
}

/// Export a pre-computed QueryResult as NDJSON.
async fn export_as_json(
    result: &crate::streaming::result_serializer::QueryResult,
    path: &str,
) -> Result<()> {
    let mut lines = Vec::with_capacity(result.rows.len());
    for row in &result.rows {
        let mut obj = serde_json::Map::new();
        for (col, val) in result.columns.iter().zip(row.iter()) {
            obj.insert(col.clone(), val.clone());
        }
        lines.push(serde_json::to_string(&serde_json::Value::Object(obj))
            .map_err(|e| AppError::ExportError(e.to_string()))?);
    }
    let content = lines.join("\n");

    tokio::fs::write(path, content)
        .await
        .map_err(|e| AppError::ExportError(e.to_string()))?;
    Ok(())
}

/// Export a QueryResult directly to Parquet, preserving JSON-decoded types
/// (numbers stay numeric, booleans stay boolean) instead of round-tripping
/// through CSV. Column types are inferred per column from the actual values:
/// integer, float, boolean, or — for anything else (text, dates, uuids) —
/// string.
fn export_result_as_parquet(result: &QueryResult, path: &str) -> Result<()> {
    use std::fs::File;

    use arrow_array::{
        ArrayRef, BooleanArray, Float64Array, Int64Array, RecordBatch, StringArray,
    };
    use arrow_schema::{DataType, Field, Schema};
    use datafusion::parquet::arrow::ArrowWriter;
    use serde_json::Value;

    if result.columns.is_empty() {
        // Degenerate result with no columns — write an empty file.
        File::create(path).map_err(|e| AppError::ExportError(e.to_string()))?;
        return Ok(());
    }

    let mut arrays: Vec<ArrayRef> = Vec::with_capacity(result.columns.len());
    let mut fields: Vec<Field> = Vec::with_capacity(result.columns.len());

    for (col_idx, col_name) in result.columns.iter().enumerate() {
        // Classify the column from its non-null values.
        let mut any_value = false;
        let mut all_bool = true;
        let mut all_int = true;
        let mut has_float = false;
        for row in &result.rows {
            match row.get(col_idx) {
                None | Some(Value::Null) => {}
                Some(Value::Number(n)) => {
                    any_value = true;
                    all_bool = false;
                    if n.as_i64().is_none() {
                        has_float = true;
                    }
                }
                Some(Value::Bool(_)) => {
                    any_value = true;
                    all_int = false;
                }
                Some(_) => {
                    any_value = true;
                    all_int = false;
                    all_bool = false;
                }
            }
        }

        let (array, dtype): (ArrayRef, DataType) = if any_value && all_bool {
            let values: Vec<Option<bool>> = result
                .rows
                .iter()
                .map(|r| match r.get(col_idx) {
                    Some(Value::Bool(b)) => Some(*b),
                    _ => None,
                })
                .collect();
            (Arc::new(BooleanArray::from(values)), DataType::Boolean)
        } else if any_value && all_int && !has_float {
            let values: Vec<Option<i64>> = result
                .rows
                .iter()
                .map(|r| match r.get(col_idx) {
                    Some(Value::Number(n)) => n.as_i64(),
                    _ => None,
                })
                .collect();
            (Arc::new(Int64Array::from(values)), DataType::Int64)
        } else if any_value && has_float {
            let values: Vec<Option<f64>> = result
                .rows
                .iter()
                .map(|r| match r.get(col_idx) {
                    Some(Value::Number(n)) => n.as_f64(),
                    _ => None,
                })
                .collect();
            (Arc::new(Float64Array::from(values)), DataType::Float64)
        } else {
            let values: Vec<Option<String>> = result
                .rows
                .iter()
                .map(|r| match r.get(col_idx) {
                    None | Some(Value::Null) => None,
                    Some(Value::String(s)) => Some(s.clone()),
                    Some(other) => Some(other.to_string()),
                })
                .collect();
            (Arc::new(StringArray::from(values)), DataType::Utf8)
        };

        arrays.push(array);
        fields.push(Field::new(col_name.clone(), dtype, true));
    }

    let schema = Arc::new(Schema::new(fields));
    let batch = RecordBatch::try_new(schema.clone(), arrays)
        .map_err(|e| AppError::ExportError(e.to_string()))?;

    let file = File::create(path).map_err(|e| AppError::ExportError(e.to_string()))?;
    let mut writer = ArrowWriter::try_new(file, schema, None)
        .map_err(|e| AppError::ExportError(e.to_string()))?;
    writer
        .write(&batch)
        .map_err(|e| AppError::ExportError(e.to_string()))?;
    writer
        .close()
        .map_err(|e| AppError::ExportError(e.to_string()))?;

    Ok(())
}
