use std::sync::Arc;

use tauri::State;

use crate::engine::dataset_registry::{DatasetInfo, DatasetRegistry};
use crate::error::Result;
use crate::loaders::LoaderPreview;
use crate::services::dataset_service::DatasetService;

/// Load a dataset from disk and register it in the registry.
#[tauri::command]
pub async fn load_dataset(
    path: String,
    name: Option<String>,
    registry: State<'_, Arc<DatasetRegistry>>,
) -> Result<DatasetInfo> {
    DatasetService::new(registry.inner().clone())
        .load_dataset(path, name)
        .await
}

/// List all registered datasets.
#[tauri::command]
pub async fn list_datasets(
    registry: State<'_, Arc<DatasetRegistry>>,
) -> Result<Vec<DatasetInfo>> {
    DatasetService::new(registry.inner().clone())
        .list_datasets()
        .await
}

/// Remove a dataset from the registry.
#[tauri::command]
pub async fn remove_dataset(
    id: String,
    registry: State<'_, Arc<DatasetRegistry>>,
) -> Result<bool> {
    DatasetService::new(registry.inner().clone())
        .remove_dataset(id)
        .await
}

/// Get a preview of a dataset (first N rows).
#[tauri::command]
pub async fn get_dataset_preview(
    id: String,
    limit: Option<usize>,
    registry: State<'_, Arc<DatasetRegistry>>,
) -> Result<LoaderPreview> {
    DatasetService::new(registry.inner().clone())
        .get_dataset_preview(id, limit)
        .await
}
