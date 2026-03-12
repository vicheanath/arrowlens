use std::sync::Arc;

use crate::engine::dataset_registry::{DatasetInfo, DatasetRegistry, FileType};
use crate::error::{AppError, Result};
use crate::loaders::{LoaderFactory, LoaderPreview};

pub struct DatasetService {
    registry: Arc<DatasetRegistry>,
}

impl DatasetService {
    pub fn new(registry: Arc<DatasetRegistry>) -> Self {
        Self { registry }
    }

    pub async fn load_dataset(&self, path: String, name: Option<String>) -> Result<DatasetInfo> {
        if !std::path::Path::new(&path).exists() {
            return Err(AppError::InvalidFilePath(format!("File not found: {}", path)));
        }

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

        let loader = LoaderFactory::create(&file_type);
        let row_count = loader.count_rows(&path).await.unwrap_or(0);
        let schema_json = loader.infer_schema(&path).await.unwrap_or_default();

        info.row_count = Some(row_count);
        info.schema_json = Some(schema_json);

        let id = self.registry.register(info.clone());
        Ok(self.registry.get(&id).unwrap_or(info))
    }

    pub async fn list_datasets(&self) -> Result<Vec<DatasetInfo>> {
        Ok(self.registry.list())
    }

    pub async fn remove_dataset(&self, id: String) -> Result<bool> {
        Ok(self.registry.remove(&id))
    }

    pub async fn get_dataset_preview(&self, id: String, limit: Option<usize>) -> Result<LoaderPreview> {
        let info = self
            .registry
            .get(&id)
            .ok_or(AppError::DatasetNotFound(id))?;

        let loader = LoaderFactory::create(&info.file_type);
        loader.load_preview(&info.source_path, limit.unwrap_or(100)).await
    }
}

fn detect_file_type(path: &str) -> Result<FileType> {
    let ext = std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    FileType::from_extension(&ext)
        .ok_or_else(|| AppError::UnsupportedFormat(format!("Unsupported file extension: .{}", ext)))
}
