use datafusion::prelude::*;

use crate::error::Result;
use crate::loaders::{DatasetLoader, LoaderPreview};
use crate::streaming::result_serializer::serialize_batches;

pub struct ParquetLoader;

#[async_trait::async_trait]
impl DatasetLoader for ParquetLoader {
    async fn load_preview(&self, path: &str, limit: usize) -> Result<LoaderPreview> {
        let ctx = SessionContext::new();
        ctx.register_parquet("_preview", path, ParquetReadOptions::default())
            .await?;

        let sql = format!("SELECT * FROM _preview LIMIT {}", limit);
        let df = ctx.sql(&sql).await?;
        let batches = df.collect().await?;

        if batches.is_empty() {
            return Ok(LoaderPreview {
                columns: vec![],
                column_types: vec![],
                rows: vec![],
                row_count: 0,
                total_rows: None,
            });
        }

        let schema = batches[0].schema();
        let columns: Vec<String> = schema.fields().iter().map(|f| f.name().clone()).collect();
        let column_types: Vec<String> = schema
            .fields()
            .iter()
            .map(|f| crate::engine::schema_manager::format_data_type(f.data_type()))
            .collect();

        let result = serialize_batches(&batches, 0)?;
        Ok(LoaderPreview {
            columns,
            column_types,
            rows: result.rows,
            row_count: result.row_count,
            total_rows: None,
        })
    }

    async fn infer_schema(&self, path: &str) -> Result<String> {
        let ctx = SessionContext::new();
        ctx.register_parquet("_schema", path, ParquetReadOptions::default())
            .await?;
        let df = ctx.sql("SELECT * FROM _schema LIMIT 0").await?;
        let schema = df.schema().as_arrow().clone();
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
    }

    async fn count_rows(&self, path: &str) -> Result<u64> {
        let ctx = SessionContext::new();
        ctx.register_parquet("_count", path, ParquetReadOptions::default())
            .await?;
        let df = ctx.sql("SELECT COUNT(*) FROM _count").await?;
        let batches = df.collect().await?;
        Ok(batches
            .first()
            .and_then(|b| {
                if b.num_rows() == 0 {
                    return None;
                }
                use arrow_array::cast::AsArray;
                use arrow_array::types::Int64Type;
                let col = b.column(0);
                Some(col.as_primitive::<Int64Type>().value(0) as u64)
            })
            .unwrap_or(0))
    }
}
