use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Structured error code for frontend error handling and recovery UI.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    // Dataset errors
    DatasetNotFound,
    DatasetLoadFailed,
    InvalidFilePath,
    UnsupportedFileFormat,

    // Query errors
    QuerySyntaxError,
    QueryExecutionError,
    QueryCancelled,
    QueryTimeoutError,

    // Schema errors
    SchemaInferenceFailed,
    SchemaMismatch,

    // IO errors
    FileAccessDenied,
    FileNotFound,
    DiskFull,
    IoError,

    // Database errors
    DatabaseConnectionFailed,
    DatabaseQueryError,
    DatabaseNotFound,

    // Cache/Memory errors
    CacheError,
    OutOfMemory,

    // Statistics errors
    StatisticsComputeFailed,

    // Serialization errors
    SerializationError,
    DeserializationError,

    // Export errors
    ExportError,

    // Generic error
    InternalError,
}

/// Enhanced error response with context and recovery suggestions.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorResponse {
    pub code: ErrorCode,
    pub message: String,
    pub context: Option<String>,
    pub suggestion: Option<String>,
}

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Dataset not found: {0}")]
    DatasetNotFound(String),

    #[error("Dataset load failed: {0}")]
    DatasetLoadFailed(String),

    #[error("Invalid file path: {0}")]
    InvalidFilePath(String),

    #[error("Unsupported file format: {0}")]
    UnsupportedFormat(String),

    #[error("Schema inference error: {0}")]
    SchemaError(String),

    #[error("Query syntax error: {0}")]
    QuerySyntaxError(String),

    #[error("Query execution error: {0}")]
    QueryError(String),

    #[error("Query cancelled")]
    QueryCancelled,

    #[error("Query timeout")]
    QueryTimeout,

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

    #[error("Statistics computation error: {0}")]
    StatisticsError(String),

    #[error("Database connection error: {0}")]
    DatabaseConnectionError(String),

    #[error("Database query error: {0}")]
    DatabaseQueryError(String),

    #[error("Out of memory")]
    OutOfMemory,

    #[error("Database not found")]
    DatabaseNotFound,

    #[error("Data load error: {0}")]
    DataLoadError(String),

    #[error("Export error: {0}")]
    ExportError(String),

    #[error("Internal error: {0}")]
    Internal(String),
}

impl AppError {
    /// Convert to ErrorResponse with context and suggestions.
    pub fn to_response(&self, context: Option<String>) -> ErrorResponse {
        let (code, message, suggestion) = match self {
            AppError::DatasetNotFound(name) => (
                ErrorCode::DatasetNotFound,
                format!("Dataset '{}' not found", name),
                Some("Try loading the dataset first from the Dataset Explorer.".to_string()),
            ),
            AppError::DatasetLoadFailed(reason) => (
                ErrorCode::DatasetLoadFailed,
                format!("Failed to load dataset: {}", reason),
                Some("Check file permissions and that the file is not corrupted.".to_string()),
            ),
            AppError::InvalidFilePath(path) => (
                ErrorCode::InvalidFilePath,
                format!("Invalid file path: {}", path),
                Some("Ensure the file path is absolute and the file exists.".to_string()),
            ),
            AppError::UnsupportedFormat(fmt) => (
                ErrorCode::UnsupportedFileFormat,
                format!("Unsupported file format: {}", fmt),
                Some("Supported formats: CSV, Parquet, JSON, Arrow".to_string()),
            ),
            AppError::SchemaError(msg) => (
                ErrorCode::SchemaInferenceFailed,
                format!("Schema error: {}", msg),
                Some("Try loading a smaller sample of the file to debug schema issues.".to_string()),
            ),
            AppError::QuerySyntaxError(msg) => (
                ErrorCode::QuerySyntaxError,
                format!("SQL syntax error: {}", msg),
                Some("Check your SQL syntax. Use Ctrl+Enter to format the query.".to_string()),
            ),
            AppError::QueryError(msg) => (
                ErrorCode::QueryExecutionError,
                format!("Query execution error: {}", msg),
                Some("Check that all referenced datasets are loaded and column names are correct.".to_string()),
            ),
            AppError::QueryCancelled => (
                ErrorCode::QueryCancelled,
                "Query was cancelled by user".to_string(),
                None,
            ),
            AppError::QueryTimeout => (
                ErrorCode::QueryTimeoutError,
                "Query execution timeout".to_string(),
                Some("Try adding LIMIT clause or filtering the dataset.".to_string()),
            ),
            AppError::CacheError(msg) => (
                ErrorCode::CacheError,
                format!("Cache error: {}", msg),
                Some("Try clearing the cache or restarting the application.".to_string()),
            ),
            AppError::StatisticsError(msg) => (
                ErrorCode::StatisticsComputeFailed,
                format!("Statistics computation error: {}", msg),
                Some("Try computing statistics on a smaller subset of data.".to_string()),
            ),
            AppError::DatabaseConnectionError(msg) => (
                ErrorCode::DatabaseConnectionFailed,
                format!("Database connection error: {}", msg),
                Some("Check database credentials and network connectivity.".to_string()),
            ),
            AppError::DatabaseQueryError(msg) => (
                ErrorCode::DatabaseQueryError,
                format!("Database query error: {}", msg),
                Some("Verify the SQL syntax and schema against the connected database.".to_string()),
            ),
            AppError::OutOfMemory => (
                ErrorCode::OutOfMemory,
                "Out of memory".to_string(),
                Some("Try closing other applications or querying a smaller dataset.".to_string()),
            ),
            AppError::DatabaseNotFound => (
                ErrorCode::DatabaseNotFound,
                "Database connection not found".to_string(),
                Some("Check that the database is still connected.".to_string()),
            ),
            AppError::DataLoadError(msg) => (
                ErrorCode::DatasetLoadFailed,
                format!("Data load error: {}", msg),
                Some("Check the file is a valid Arrow IPC file and not corrupted.".to_string()),
            ),
            AppError::ExportError(msg) => (
                ErrorCode::ExportError,
                format!("Export failed: {}", msg),
                Some("Ensure the destination path is writable and has enough disk space.".to_string()),
            ),
            AppError::IoError(_) => (
                ErrorCode::FileAccessDenied,
                "File I/O error occurred.".to_string(),
                Some("Check file permissions and disk space.".to_string()),
            ),
            AppError::SerializationError(_) | AppError::DataFusionError(_) | AppError::ArrowError(_) => (
                ErrorCode::InternalError,
                self.to_string(),
                Some("This is an unexpected internal error. Please check the logs.".to_string()),
            ),
            AppError::Internal(msg) => (
                ErrorCode::InternalError,
                format!("Internal error: {}", msg),
                Some("This is an unexpected internal error. Please check the logs.".to_string()),
            ),
        };

        ErrorResponse { code, message, context, suggestion }
    }
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let response = self.to_response(None);
        response.serialize(serializer)
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
