use std::collections::HashMap;

use parking_lot::Mutex;

/// A tiny in-memory string cache keyed by content hash. Used to avoid repeat
/// LLM calls for stable inputs (e.g. a schema explanation for an unchanged
/// schema). Bounded by a simple size cap with FIFO-ish eviction.
pub struct ResponseCache {
    inner: Mutex<HashMap<String, String>>,
    capacity: usize,
}

impl ResponseCache {
    pub fn new() -> Self {
        Self { inner: Mutex::new(HashMap::new()), capacity: 64 }
    }

    pub fn get(&self, key: &str) -> Option<String> {
        self.inner.lock().get(key).cloned()
    }

    pub fn put(&self, key: String, value: String) {
        // Never cache an empty/whitespace-only response: a failed or empty model
        // completion would otherwise be replayed forever, masking the real result.
        if value.trim().is_empty() {
            return;
        }
        let mut map = self.inner.lock();
        if map.len() >= self.capacity && !map.contains_key(&key) {
            if let Some(victim) = map.keys().next().cloned() {
                map.remove(&victim);
            }
        }
        map.insert(key, value);
    }

    pub fn clear(&self) {
        self.inner.lock().clear();
    }
}

impl Default for ResponseCache {
    fn default() -> Self {
        Self::new()
    }
}
