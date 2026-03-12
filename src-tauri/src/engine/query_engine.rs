use std::sync::Arc;
use std::time::Instant;

use datafusion::execution::context::SessionContext;
use datafusion::prelude::*;

use crate::engine::dataset_registry::{DatasetInfo, DatasetRegistry, FileType};
use crate::error::{AppError, Result};
use crate::streaming::result_serializer::QueryResult;

/// Central query engine wrapping a DataFusion SessionContext.
pub struct QueryEngine {
    registry: Arc<DatasetRegistry>,
}

impl QueryEngine {
    pub fn new(registry: Arc<DatasetRegistry>) -> Self {
        Self { registry }
    }

    /// Build a fresh SessionContext with all registered datasets pre-registered.
    async fn build_context(&self) -> Result<SessionContext> {
        let ctx = SessionContext::new();
        for dataset in self.registry.list() {
            self.register_dataset_in_ctx(&ctx, &dataset).await?;
        }
        Ok(ctx)
    }

    async fn register_dataset_in_ctx(
        &self,
        ctx: &SessionContext,
        dataset: &DatasetInfo,
    ) -> Result<()> {
        let table_name = sanitize_table_name(&dataset.name);
        let path = &dataset.source_path;

        match dataset.file_type {
            FileType::Csv => {
                ctx.register_csv(&table_name, path, CsvReadOptions::new())
                    .await?;
            }
            FileType::Parquet => {
                ctx.register_parquet(&table_name, path, ParquetReadOptions::default())
                    .await?;
            }
            FileType::Json => {
                ctx.register_json(&table_name, path, NdJsonReadOptions::default())
                    .await?;
            }
            FileType::Arrow => {
                use crate::loaders::arrow_loader::read_all_batches;
                use datafusion::datasource::MemTable;
                if let Ok((batches, schema)) = read_all_batches(path) {
                    if let Ok(mem_table) = MemTable::try_new(schema, vec![batches]) {
                        let _ = ctx.register_table(&table_name, Arc::new(mem_table));
                    }
                }
            }
        }
        Ok(())
    }

    /// Execute a SQL query and return all results at once (for smaller result sets).
    pub async fn execute_query(&self, sql: &str) -> Result<QueryResult> {
        let ctx = self.build_context().await?;
        let start = Instant::now();

        let df = ctx
            .sql(sql)
            .await
            .map_err(|e| AppError::QueryError(e.to_string()))?;

        let batches = df
            .collect()
            .await
            .map_err(|e| AppError::QueryError(e.to_string()))?;

        let elapsed_ms = start.elapsed().as_millis() as u64;

        let result = crate::streaming::result_serializer::serialize_batches(
            &batches,
            elapsed_ms,
        )?;

        Ok(result)
    }

    /// Execute a SQL query and return a streaming DataFusion DataFrame for chunk-by-chunk delivery.
    pub async fn execute_streaming(
        &self,
        sql: &str,
    ) -> Result<datafusion::dataframe::DataFrame> {
        let ctx = self.build_context().await?;
        let df = ctx
            .sql(sql)
            .await
            .map_err(|e| AppError::QueryError(e.to_string()))?;
        Ok(df)
    }
}

/// Convert dataset names to valid SQL identifiers.
fn sanitize_table_name(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() || c == '_' { c } else { '_' })
        .collect::<String>()
        .trim_start_matches(|c: char| c.is_numeric())
        .to_string()
        .to_lowercase()
}
