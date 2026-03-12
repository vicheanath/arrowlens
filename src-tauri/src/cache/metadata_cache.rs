use std::collections::HashMap;
use std::sync::Arc;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};

/// Cached metadata entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedMetadata {
    pub dataset_id: String,
    pub schema_json: String,
    pub row_count: u64,
    pub cached_at: String,
}

/// In-memory metadata cache.
pub struct MetadataCache {
    store: Arc<RwLock<HashMap<String, CachedMetadata>>>,
}

impl MetadataCache {
    pub fn new() -> Self {
        Self {
            store: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub fn get(&self, dataset_id: &str) -> Option<CachedMetadata> {
        self.store.read().get(dataset_id).cloned()
    }

    pub fn set(&self, entry: CachedMetadata) {
        self.store.write().insert(entry.dataset_id.clone(), entry);
    }

    pub fn invalidate(&self, dataset_id: &str) {
        self.store.write().remove(dataset_id);
    }

    pub fn clear(&self) {
        self.store.write().clear();
    }
}

impl Default for MetadataCache {
    fn default() -> Self {
        Self::new()
    }
}
