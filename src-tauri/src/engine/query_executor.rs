use std::sync::Arc;

use async_trait::async_trait;
use tauri::AppHandle;

use crate::engine::database_executor::DatabaseExecutor;
use crate::engine::database_registry::DatabaseRegistry;
use crate::engine::dataset_executor::DatasetExecutor;
use crate::engine::dataset_registry::DatasetRegistry;
use crate::error::Result;
use crate::streaming::result_serializer::QueryResult;

#[derive(Debug, Clone)]
pub enum ExecutionTarget {
    Datasets,
    Database { connection_id: String },
}

#[async_trait]
pub trait QueryExecutor: Send + Sync {
    async fn execute(&self, sql: &str) -> Result<QueryResult>;
    async fn execute_streaming(
        &self,
        app: AppHandle,
        query_id: String,
        sql: &str,
        chunk_size: usize,
    ) -> Result<()>;
}

pub struct ExecutorFactory {
    dataset_registry: Arc<DatasetRegistry>,
    database_registry: Arc<DatabaseRegistry>,
}

impl ExecutorFactory {
    pub fn new(
        dataset_registry: Arc<DatasetRegistry>,
        database_registry: Arc<DatabaseRegistry>,
    ) -> Self {
        Self {
            dataset_registry,
            database_registry,
        }
    }

    pub fn resolve(&self, target: ExecutionTarget) -> Result<Box<dyn QueryExecutor>> {
        match target {
            ExecutionTarget::Datasets => Ok(Box::new(DatasetExecutor::new(
                self.dataset_registry.clone(),
            ))),
            ExecutionTarget::Database { connection_id } => Ok(Box::new(
                DatabaseExecutor::from_registry(self.database_registry.clone(), &connection_id)?,
            )),
        }
    }
}