use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Dataset not found: {0}")]
    DatasetNotFound(String),

    #[error("Unsupported file format: {0}")]
    UnsupportedFormat(String),

    #[error("Schema error: {0}")]
    SchemaError(String),

    #[error("Query execution error: {0}")]
    QueryError(String),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("DataFusion error: {0}")]
    DataFusionError(#[from] datafusion::error::DataFusionError),

    #[error("Arrow error: {0}")]
    ArrowError(#[from] arrow::error::ArrowError),

    #[error("Serialization error: {0}")]
    SerializationError(#[from] serde_json::Error),

    #[error("Cache error: {0}")]
    CacheError(String),

    #[error("Statistics error: {0}")]
    StatisticsError(String),
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
