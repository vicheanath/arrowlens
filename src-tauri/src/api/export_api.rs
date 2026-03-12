use std::sync::Arc;

use tauri::State;

use crate::engine::dataset_registry::DatasetRegistry;
use crate::engine::query_engine::QueryEngine;
use crate::error::{AppError, Result};

#[derive(Debug, serde::Deserialize, serde::Serialize, Clone, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Csv,
    Json,
    Parquet,
}

/// Export the results of a SQL query to a file in the chosen format.
/// Returns the number of rows exported.
#[tauri::command]
pub async fn export_query_results(
    sql: String,
    dest_path: String,
    format: ExportFormat,
    registry: State<'_, Arc<DatasetRegistry>>,
) -> Result<u64> {
    if sql.trim().is_empty() {
        return Err(AppError::QuerySyntaxError("Query cannot be empty".to_string()));
    }

    let engine = QueryEngine::new(registry.inner().clone());
    let result = engine.execute_query(&sql).await?;
    let row_count = result.row_count as u64;

    match format {
        ExportFormat::Csv => export_as_csv(&result, &dest_path).await?,
        ExportFormat::Json => export_as_json(&result, &dest_path).await?,
        ExportFormat::Parquet => export_as_parquet_via_csv(&result, &dest_path).await?,
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

/// Export as Parquet by first writing CSV then using DataFusion to convert.
/// This avoids a complex direct-Parquet writer dependency.
async fn export_as_parquet_via_csv(
    result: &crate::streaming::result_serializer::QueryResult,
    path: &str,
) -> Result<()> {
    use datafusion::prelude::*;
    use datafusion::dataframe::DataFrameWriteOptions;

    // Write CSV to a temp file first
    let tmp_csv = format!("{}.tmp_export.csv", path);
    export_as_csv(result, &tmp_csv).await?;

    // Read CSV with DataFusion then write Parquet
    let ctx = SessionContext::new();
    ctx.register_csv("_export", &tmp_csv, CsvReadOptions::new().has_header(true))
        .await
        .map_err(|e| AppError::ExportError(e.to_string()))?;

    let df = ctx
        .sql("SELECT * FROM _export")
        .await
        .map_err(|e| AppError::ExportError(e.to_string()))?;

    df.write_parquet(path, DataFrameWriteOptions::new(), None)
        .await
        .map_err(|e| AppError::ExportError(e.to_string()))?;

    // Remove temp CSV
    let _ = tokio::fs::remove_file(&tmp_csv).await;

    Ok(())
}
