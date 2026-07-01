pub mod cache;
pub mod config;
pub mod context;
pub mod features;
pub mod provider;
pub mod validate;

use parking_lot::RwLock;

use config::AiConfig;

/// Shared, mutable AI state managed by Tauri. Holds the active configuration
/// (restored from and persisted to `AppStore`) and a response cache.
pub struct AiState {
    config: RwLock<AiConfig>,
    pub cache: cache::ResponseCache,
}

impl AiState {
    pub fn new(config: AiConfig) -> Self {
        Self { config: RwLock::new(config), cache: cache::ResponseCache::new() }
    }

    pub fn config(&self) -> AiConfig {
        self.config.read().clone()
    }

    /// Apply a mutation to the config and return the updated snapshot.
    pub fn update<F: FnOnce(&mut AiConfig)>(&self, f: F) -> AiConfig {
        let mut guard = self.config.write();
        f(&mut guard);
        guard.clone()
    }
}
