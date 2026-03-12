use serde::{Deserialize, Serialize};

/// Represents the logical plan derived for a SQL statement.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryPlan {
    pub sql: String,
    pub logical_plan: String,
    pub optimized_plan: String,
    pub estimated_rows: Option<u64>,
}

/// Builds and explains the query plan for the given SQL.
pub async fn explain_query(
    registry: &crate::engine::dataset_registry::DatasetRegistry,
    sql: &str,
) -> crate::error::Result<QueryPlan> {
    use datafusion::prelude::*;
    use crate::engine::dataset_registry::FileType;

    let ctx = SessionContext::new();

    for dataset in registry.list() {
        let table_name = sanitize_table_name(&dataset.name);
        match dataset.file_type {
            FileType::Csv => {
                let _ = ctx
                    .register_csv(&table_name, &dataset.source_path, CsvReadOptions::new())
                    .await;
            }
            FileType::Parquet => {
                let _ = ctx
                    .register_parquet(
                        &table_name,
                        &dataset.source_path,
                        ParquetReadOptions::default(),
                    )
                    .await;
            }
            FileType::Json => {
                let _ = ctx
                    .register_json(
                        &table_name,
                        &dataset.source_path,
                        NdJsonReadOptions::default(),
                    )
                    .await;
            }
            _ => {}
        }
    }

    let plan = ctx
        .sql(&format!("EXPLAIN {}", sql))
        .await
        .map_err(|e| crate::error::AppError::QueryError(e.to_string()))?;

    let batches = plan
        .collect()
        .await
        .map_err(|e| crate::error::AppError::QueryError(e.to_string()))?;

    let mut plan_lines = Vec::new();
    for batch in &batches {
        for row in 0..batch.num_rows() {
            if let Some(col) = batch.column_by_name("plan") {
                use arrow_array::{Array, StringArray};
                if let Some(arr) = col.as_any().downcast_ref::<StringArray>() {
                    if !Array::is_null(arr, row) {
                        plan_lines.push(arr.value(row).to_string());
                    }
                }
            }
        }
    }

    Ok(QueryPlan {
        sql: sql.to_string(),
        logical_plan: plan_lines.join("\n"),
        optimized_plan: String::new(),
        estimated_rows: None,
    })
}

fn sanitize_table_name(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() || c == '_' { c } else { '_' })
        .collect::<String>()
        .to_lowercase()
}
