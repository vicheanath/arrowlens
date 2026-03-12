use std::fs;
use std::path::{Path, PathBuf};

use parking_lot::RwLock;
use serde::{Deserialize, Serialize};

use crate::api::query_api::HistoryEntry;
use crate::engine::database_registry::DatabaseConnectionInfo;
use crate::error::{AppError, Result};

const APP_STATE_FILE: &str = "app_state.json";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct PersistedAppState {
    #[serde(default)]
    query_history: Vec<HistoryEntry>,
    #[serde(default)]
    database_connections: Vec<DatabaseConnectionInfo>,
}

pub struct AppStore {
    state_file: PathBuf,
    state: RwLock<PersistedAppState>,
}

impl AppStore {
    pub fn initialize(app_data_dir: &Path) -> Result<Self> {
        fs::create_dir_all(app_data_dir)?;
        let state_file = app_data_dir.join(APP_STATE_FILE);
        let state = if state_file.exists() {
            Self::read_state(&state_file)?
        } else {
            PersistedAppState::default()
        };

        Ok(Self {
            state_file,
            state: RwLock::new(state),
        })
    }

    pub fn load_query_history(&self) -> Vec<HistoryEntry> {
        self.state.read().query_history.clone()
    }

    pub fn save_query_history(&self, history: &[HistoryEntry]) -> Result<()> {
        let mut lock = self.state.write();
        lock.query_history = history.to_vec();
        Self::write_state_atomically(&self.state_file, &lock)
    }

    pub fn load_database_connections(&self) -> Vec<DatabaseConnectionInfo> {
        self.state.read().database_connections.clone()
    }

    pub fn save_database_connections(&self, connections: &[DatabaseConnectionInfo]) -> Result<()> {
        let mut lock = self.state.write();
        lock.database_connections = connections.to_vec();
        Self::write_state_atomically(&self.state_file, &lock)
    }

    fn read_state(path: &Path) -> Result<PersistedAppState> {
        let raw = fs::read_to_string(path)?;
        if raw.trim().is_empty() {
            return Ok(PersistedAppState::default());
        }
        serde_json::from_str(&raw)
            .map_err(|e| AppError::CacheError(format!("Failed to parse app state JSON: {e}")))
    }

    fn write_state_atomically(path: &Path, state: &PersistedAppState) -> Result<()> {
        let bytes = serde_json::to_vec_pretty(state)
            .map_err(|e| AppError::CacheError(format!("Failed to serialize app state: {e}")))?;
        let tmp_path = path.with_extension("json.tmp");

        fs::write(&tmp_path, bytes)?;
        fs::rename(&tmp_path, path).map_err(|e| {
            AppError::CacheError(format!(
                "Failed to atomically replace app state file: {e}"
            ))
        })?;

        Ok(())
    }
}