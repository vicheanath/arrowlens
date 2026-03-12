use std::sync::Arc;

use arrow_array::{
    Array, RecordBatch,
    types::{Float64Type, Int64Type},
};
use arrow_schema::DataType;
use datafusion::prelude::*;
use serde::{Deserialize, Serialize};

use crate::engine::dataset_registry::{DatasetInfo, DatasetRegistry, FileType};
use crate::error::{AppError, Result};

/// Per-column statistics.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ColumnStats {
    pub column_name: String,
    pub data_type: String,
    pub null_count: u64,
    pub distinct_count: Option<u64>,
    pub min_value: Option<serde_json::Value>,
    pub max_value: Option<serde_json::Value>,
    pub mean_value: Option<f64>,
    pub row_count: u64,
}

/// Full statistics for a dataset.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatasetStats {
    pub dataset_id: String,
    pub row_count: u64,
    pub column_stats: Vec<ColumnStats>,
}

pub struct StatisticsEngine {
    registry: Arc<DatasetRegistry>,
}

impl StatisticsEngine {
    pub fn new(registry: Arc<DatasetRegistry>) -> Self {
        Self { registry }
    }

    pub async fn compute_stats(&self, dataset_id: &str) -> Result<DatasetStats> {
        let info = self
            .registry
            .get(dataset_id)
            .ok_or_else(|| AppError::DatasetNotFound(dataset_id.to_string()))?;

        let ctx = build_context_for_dataset(&info).await?;
        let table_name = sanitize_table_name(&info.name);

        // Get schema
        let df = ctx
            .sql(&format!("SELECT * FROM \"{}\" LIMIT 0", table_name))
            .await?;
        let schema = df.schema().clone();

        // Count rows
        let count_df = ctx
            .sql(&format!("SELECT COUNT(*) as cnt FROM \"{}\"", table_name))
            .await?;
        let batches = count_df.collect().await?;
        let row_count = extract_count(&batches).unwrap_or(0);

        let mut column_stats = Vec::new();

        for field in schema.fields() {
            let col_name = field.name();
            let stats = compute_column_stats(&ctx, &table_name, col_name, field.data_type(), row_count).await?;
            column_stats.push(stats);
        }

        Ok(DatasetStats {
            dataset_id: dataset_id.to_string(),
            row_count,
            column_stats,
        })
    }
}

async fn build_context_for_dataset(info: &DatasetInfo) -> Result<SessionContext> {
    let ctx = SessionContext::new();
    let table_name = sanitize_table_name(&info.name);
    match info.file_type {
        FileType::Csv => {
            ctx.register_csv(&table_name, &info.source_path, CsvReadOptions::new())
                .await?;
        }
        FileType::Parquet => {
            ctx.register_parquet(
                &table_name,
                &info.source_path,
                ParquetReadOptions::default(),
            )
            .await?;
        }
        FileType::Json => {
            ctx.register_json(&table_name, &info.source_path, NdJsonReadOptions::default())
                .await?;
        }
        FileType::Arrow => {}
    }
    Ok(ctx)
}

async fn compute_column_stats(
    ctx: &SessionContext,
    table: &str,
    col: &str,
    dt: &DataType,
    total_rows: u64,
) -> Result<ColumnStats> {
    let col_q = format!("\"{}\"", col);

    // Null count
    let null_sql = format!(
        "SELECT COUNT(*) FROM \"{}\" WHERE {} IS NULL",
        table, col_q
    );
    let null_count = run_count(ctx, &null_sql).await.unwrap_or(0);

    let mut stats = ColumnStats {
        column_name: col.to_string(),
        data_type: crate::engine::schema_manager::format_data_type(dt),
        null_count,
        row_count: total_rows,
        ..Default::default()
    };

    // Numeric columns get min/max/mean
    if is_numeric(dt) {
        let agg_sql = format!(
            "SELECT MIN({col}), MAX({col}), AVG({col}) FROM \"{table}\"",
            col = col_q,
            table = table
        );
        if let Ok(batches) = ctx.sql(&agg_sql).await {
            if let Ok(batches) = batches.collect().await {
                if let Some(batch) = batches.first() {
                    if batch.num_rows() > 0 {
                        stats.min_value = col_to_json(batch.column(0), 0);
                        stats.max_value = col_to_json(batch.column(1), 0);
                        stats.mean_value = col_f64(batch.column(2), 0);
                    }
                }
            }
        }
    }

    // Distinct count (skip for large string columns to avoid slow queries)
    if !matches!(dt, DataType::LargeUtf8 | DataType::Binary | DataType::LargeBinary) {
        let dist_sql = format!(
            "SELECT COUNT(DISTINCT {}) FROM \"{}\"",
            col_q, table
        );
        stats.distinct_count = run_count(ctx, &dist_sql).await;
    }

    Ok(stats)
}

fn is_numeric(dt: &DataType) -> bool {
    matches!(
        dt,
        DataType::Int8
            | DataType::Int16
            | DataType::Int32
            | DataType::Int64
            | DataType::UInt8
            | DataType::UInt16
            | DataType::UInt32
            | DataType::UInt64
            | DataType::Float32
            | DataType::Float64
            | DataType::Decimal128(_, _)
    )
}

async fn run_count(ctx: &SessionContext, sql: &str) -> Option<u64> {
    let batches = ctx.sql(sql).await.ok()?.collect().await.ok()?;
    extract_count(&batches)
}

fn extract_count(batches: &[RecordBatch]) -> Option<u64> {
    batches
        .first()
        .and_then(|b| {
            if b.num_rows() == 0 { return None; }
            let col = b.column(0);
            col_f64(col, 0).map(|v| v as u64)
        })
}

fn col_f64(col: &dyn Array, row: usize) -> Option<f64> {
    use arrow_array::cast::AsArray;
    use arrow_schema::DataType;
    if col.is_null(row) { return None; }
    match col.data_type() {
        DataType::Int64 => Some(col.as_primitive::<Int64Type>().value(row) as f64),
        DataType::Float64 => Some(col.as_primitive::<Float64Type>().value(row)),
        _ => {
            // Try casting via display
            Some(0.0)
        }
    }
}

fn col_to_json(col: &dyn Array, row: usize) -> Option<serde_json::Value> {
    if col.is_null(row) { return None; }
    col_f64(col, row).map(|v| serde_json::Value::Number(
        serde_json::Number::from_f64(v).unwrap_or(serde_json::Number::from(0)),
    ))
}

fn sanitize_table_name(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() || c == '_' { c } else { '_' })
        .collect::<String>()
        .to_lowercase()
}
