use std::collections::HashMap;
use std::sync::Arc;

use chrono::{DateTime, Utc};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DatabaseType {
    Sqlite,
    Mysql,
    Postgres,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseConnectionInfo {
    pub id: String,
    pub name: String,
    pub database_type: DatabaseType,
    pub connection_string: String,
    pub created_at: DateTime<Utc>,
}

impl DatabaseConnectionInfo {
    pub fn new(name: String, database_type: DatabaseType, connection_string: String) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            database_type,
            connection_string,
            created_at: Utc::now(),
        }
    }
}

/// Thread-safe registry for multiple database connections.
pub struct DatabaseRegistry {
    connections: Arc<RwLock<HashMap<String, DatabaseConnectionInfo>>>,
}

impl DatabaseRegistry {
    pub fn new() -> Self {
        Self {
            connections: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub fn register(&self, info: DatabaseConnectionInfo) -> String {
        let id = info.id.clone();
        self.connections.write().insert(id.clone(), info);
        id
    }

    pub fn get(&self, id: &str) -> Option<DatabaseConnectionInfo> {
        self.connections.read().get(id).cloned()
    }

    pub fn list(&self) -> Vec<DatabaseConnectionInfo> {
        let lock = self.connections.read();
        let mut v: Vec<DatabaseConnectionInfo> = lock.values().cloned().collect();
        v.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        v
    }

    pub fn remove(&self, id: &str) -> bool {
        self.connections.write().remove(id).is_some()
    }
}

impl Default for DatabaseRegistry {
    fn default() -> Self {
        Self::new()
    }
}
