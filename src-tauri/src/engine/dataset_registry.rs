use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;

use chrono::{DateTime, Utc};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Supported file formats for dataset loading.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum FileType {
    Csv,
    Parquet,
    Json,
    Arrow,
}

impl FileType {
    pub fn from_extension(ext: &str) -> Option<Self> {
        match ext.to_lowercase().as_str() {
            "csv" | "tsv" => Some(FileType::Csv),
            "parquet" | "pq" => Some(FileType::Parquet),
            "json" | "ndjson" | "jsonl" => Some(FileType::Json),
            "arrow" | "ipc" | "feather" => Some(FileType::Arrow),
            _ => None,
        }
    }
}

/// Metadata for a registered dataset.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatasetInfo {
    pub id: String,
    pub name: String,
    pub source_path: String,
    pub file_type: FileType,
    pub row_count: Option<u64>,
    pub size_bytes: u64,
    pub schema_json: Option<String>,
    pub created_at: DateTime<Utc>,
}

impl DatasetInfo {
    pub fn new(name: String, source_path: String, file_type: FileType, size_bytes: u64) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            source_path,
            file_type,
            row_count: None,
            size_bytes,
            schema_json: None,
            created_at: Utc::now(),
        }
    }
}

/// Thread-safe registry of all loaded datasets.
pub struct DatasetRegistry {
    datasets: Arc<RwLock<HashMap<String, DatasetInfo>>>,
}

impl DatasetRegistry {
    pub fn new() -> Self {
        Self {
            datasets: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub fn register(&self, mut info: DatasetInfo) -> String {
        let id = info.id.clone();
        // Derive name from file path if empty
        if info.name.is_empty() {
            if let Some(stem) = Path::new(&info.source_path).file_stem() {
                info.name = stem.to_string_lossy().to_string();
            }
        }
        self.datasets.write().insert(id.clone(), info);
        id
    }

    pub fn get(&self, id: &str) -> Option<DatasetInfo> {
        self.datasets.read().get(id).cloned()
    }

    pub fn update(&self, info: DatasetInfo) {
        self.datasets.write().insert(info.id.clone(), info);
    }

    pub fn list(&self) -> Vec<DatasetInfo> {
        let lock = self.datasets.read();
        let mut v: Vec<DatasetInfo> = lock.values().cloned().collect();
        v.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        v
    }

    pub fn remove(&self, id: &str) -> bool {
        self.datasets.write().remove(id).is_some()
    }

    pub fn find_by_name(&self, name: &str) -> Option<DatasetInfo> {
        self.datasets
            .read()
            .values()
            .find(|d| d.name == name)
            .cloned()
    }
}

impl Default for DatasetRegistry {
    fn default() -> Self {
        Self::new()
    }
}
