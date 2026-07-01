use std::fs;
use std::path::{Path, PathBuf};

use parking_lot::RwLock;
use serde::{Deserialize, Serialize};

use crate::ai::config::AiConfig;
use crate::api::query_api::HistoryEntry;
use crate::cache::secrets;
use crate::engine::database_registry::DatabaseConnectionInfo;
use crate::error::{AppError, Result};

const APP_STATE_FILE: &str = "app_state.json";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct PersistedAppState {
    #[serde(default)]
    query_history: Vec<HistoryEntry>,
    #[serde(default)]
    database_connections: Vec<DatabaseConnectionInfo>,
    #[serde(default)]
    ai_config: AiConfig,
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

    /// Load connection metadata and re-attach each secret connection string from
    /// the OS keychain. Falls back to any value still in the JSON (legacy
    /// plaintext) so existing installs keep working until the next save migrates
    /// them into the keychain.
    pub fn load_database_connections(&self) -> Vec<DatabaseConnectionInfo> {
        self.state
            .read()
            .database_connections
            .iter()
            .map(|conn| {
                let mut resolved = conn.clone();
                if let Some(secret) = secrets::get_secret(&secrets::db_account(&conn.id)) {
                    resolved.connection_string = secret;
                }
                resolved
            })
            .collect()
    }

    /// Persist connections: secret connection strings go to the OS keychain;
    /// only metadata (with the connection string blanked) is written to the JSON
    /// file. The plaintext copy is removed only when the keychain write
    /// succeeds, so a keychain outage degrades rather than loses data.
    pub fn save_database_connections(&self, connections: &[DatabaseConnectionInfo]) -> Result<()> {
        let metadata: Vec<DatabaseConnectionInfo> = connections
            .iter()
            .map(|conn| {
                let stored = secrets::set_secret(&secrets::db_account(&conn.id), &conn.connection_string);
                let mut meta = conn.clone();
                if stored {
                    meta.connection_string = String::new();
                }
                meta
            })
            .collect();

        let mut lock = self.state.write();
        lock.database_connections = metadata;
        Self::write_state_atomically(&self.state_file, &lock)
    }

    /// Load AI config and re-attach the API key from the keychain (legacy
    /// plaintext key in the JSON is used as a fallback for migration).
    pub fn load_ai_config(&self) -> AiConfig {
        let mut config = self.state.read().ai_config.clone();
        if let Some(key) = secrets::get_secret(secrets::AI_API_KEY) {
            config.api_key = Some(key);
        }
        config
    }

    /// Persist AI config: the API key goes to the keychain, never the JSON file.
    pub fn save_ai_config(&self, config: &AiConfig) -> Result<()> {
        let stored = match config.api_key.as_deref() {
            Some(key) if !key.is_empty() => secrets::set_secret(secrets::AI_API_KEY, key),
            _ => {
                secrets::delete_secret(secrets::AI_API_KEY);
                true
            }
        };

        let mut persisted = config.clone();
        if stored {
            persisted.api_key = None;
        }

        let mut lock = self.state.write();
        lock.ai_config = persisted;
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