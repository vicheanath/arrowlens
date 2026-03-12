pub mod arrow_loader;
pub mod csv_loader;
pub mod json_loader;
pub mod parquet_loader;

use crate::engine::dataset_registry::FileType;
use crate::error::Result;

/// Trait that all dataset loaders implement.
#[async_trait::async_trait]
pub trait DatasetLoader: Send + Sync {
    /// Return a preview of the first N rows and infer schema.
    async fn load_preview(&self, path: &str, limit: usize) -> Result<LoaderPreview>;
    /// Return the inferred Arrow schema as JSON string.
    async fn infer_schema(&self, path: &str) -> Result<String>;
    /// Count the total number of rows (may be approximate for large files).
    async fn count_rows(&self, path: &str) -> Result<u64>;
}

/// Preview data returned by a loader.
#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct LoaderPreview {
    pub columns: Vec<String>,
    pub column_types: Vec<String>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub row_count: usize,
    pub total_rows: Option<u64>,
}

pub struct LoaderFactory;

impl LoaderFactory {
    pub fn create(file_type: &FileType) -> Box<dyn DatasetLoader> {
        match file_type {
            FileType::Csv => Box::new(csv_loader::CsvLoader),
            FileType::Parquet => Box::new(parquet_loader::ParquetLoader),
            FileType::Json => Box::new(json_loader::JsonLoader),
            FileType::Arrow => Box::new(arrow_loader::ArrowLoader),
        }
    }
}
