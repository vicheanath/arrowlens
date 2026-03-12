use std::sync::Arc;

use tauri::State;

use crate::engine::dataset_registry::{DatasetInfo, DatasetRegistry, FileType};
use crate::loaders::{csv_loader::CsvLoader, json_loader::JsonLoader, parquet_loader::ParquetLoader, DatasetLoader, LoaderPreview};

/// Load a dataset from disk and register it in the registry.
#[tauri::command]
pub async fn load_dataset(
    path: String,
    name: Option<String>,
    registry: State<'_, Arc<DatasetRegistry>>,
) -> Result<DatasetInfo, String> {
    let file_type = detect_file_type(&path)?;

    let size_bytes = std::fs::metadata(&path)
        .map(|m| m.len())
        .unwrap_or(0);

    let dataset_name = name.unwrap_or_else(|| {
        std::path::Path::new(&path)
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "dataset".to_string())
    });

    let mut info = DatasetInfo::new(dataset_name, path.clone(), file_type.clone(), size_bytes);

    // Count rows and infer schema
    let (row_count, schema_json) = match &file_type {
        FileType::Csv => {
            let loader = CsvLoader;
            let count = loader.count_rows(&path).await.unwrap_or(0);
            let schema = loader.infer_schema(&path).await.unwrap_or_default();
            (count, schema)
        }
        FileType::Parquet => {
            let loader = ParquetLoader;
            let count = loader.count_rows(&path).await.unwrap_or(0);
            let schema = loader.infer_schema(&path).await.unwrap_or_default();
            (count, schema)
        }
        FileType::Json => {
            let loader = JsonLoader;
            let count = loader.count_rows(&path).await.unwrap_or(0);
            let schema = loader.infer_schema(&path).await.unwrap_or_default();
            (count, schema)
        }
        FileType::Arrow => (0, String::new()),
    };

    info.row_count = Some(row_count);
    info.schema_json = Some(schema_json);

    let id = registry.register(info.clone());
    Ok(registry.get(&id).unwrap_or(info))
}

/// List all registered datasets.
#[tauri::command]
pub async fn list_datasets(
    registry: State<'_, Arc<DatasetRegistry>>,
) -> Result<Vec<DatasetInfo>, String> {
    Ok(registry.list())
}

/// Remove a dataset from the registry.
#[tauri::command]
pub async fn remove_dataset(
    id: String,
    registry: State<'_, Arc<DatasetRegistry>>,
) -> Result<bool, String> {
    Ok(registry.remove(&id))
}

/// Get a preview of a dataset (first N rows).
#[tauri::command]
pub async fn get_dataset_preview(
    id: String,
    limit: Option<usize>,
    registry: State<'_, Arc<DatasetRegistry>>,
) -> Result<LoaderPreview, String> {
    let info = registry
        .get(&id)
        .ok_or_else(|| format!("Dataset not found: {}", id))?;

    let limit = limit.unwrap_or(100);

    let preview = match info.file_type {
        FileType::Csv => CsvLoader.load_preview(&info.source_path, limit).await,
        FileType::Parquet => ParquetLoader.load_preview(&info.source_path, limit).await,
        FileType::Json => JsonLoader.load_preview(&info.source_path, limit).await,
        FileType::Arrow => Err(crate::error::AppError::UnsupportedFormat(
            "Arrow IPC preview not yet implemented".into(),
        )),
    };

    preview.map_err(|e| e.to_string())
}

fn detect_file_type(path: &str) -> Result<FileType, String> {
    let ext = std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    FileType::from_extension(&ext)
        .ok_or_else(|| format!("Unsupported file extension: .{}", ext))
}
