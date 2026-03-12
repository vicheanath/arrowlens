use std::sync::Arc;

use async_trait::async_trait;
use tauri::AppHandle;

use crate::engine::dataset_registry::DatasetRegistry;
use crate::engine::query_engine::QueryEngine;
use crate::engine::query_executor::QueryExecutor;
use crate::error::Result;
use crate::streaming::record_batch_stream::stream_to_frontend;
use crate::streaming::result_serializer::QueryResult;

pub struct DatasetExecutor {
    registry: Arc<DatasetRegistry>,
}

impl DatasetExecutor {
    pub fn new(registry: Arc<DatasetRegistry>) -> Self {
        Self { registry }
    }
}

#[async_trait]
impl QueryExecutor for DatasetExecutor {
    async fn execute(&self, sql: &str) -> Result<QueryResult> {
        let engine = QueryEngine::new(self.registry.clone());
        engine.execute_query(sql).await
    }

    async fn execute_streaming(
        &self,
        app: AppHandle,
        query_id: String,
        sql: &str,
        chunk_size: usize,
    ) -> Result<()> {
        let engine = QueryEngine::new(self.registry.clone());
        let df = engine.execute_streaming(sql).await?;
        let stream = df.execute_stream().await?;
        stream_to_frontend(app, query_id, stream, chunk_size).await
    }
}