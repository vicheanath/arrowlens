use std::collections::HashMap;
use std::sync::Arc;

use chrono::{DateTime, Utc};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use sqlx::{any::AnyPoolOptions, AnyPool};
use tokio::sync::RwLock as TokioRwLock;
use uuid::Uuid;

use crate::error::{AppError, Result};

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

/// Thread-safe registry for multiple database connections with a shared pool cache.
pub struct DatabaseRegistry {
    connections: Arc<RwLock<HashMap<String, DatabaseConnectionInfo>>>,
    /// Lazily-created persistent pools keyed by connection id.
    pool_cache: Arc<TokioRwLock<HashMap<String, AnyPool>>>,
}

impl DatabaseRegistry {
    pub fn new() -> Self {
        Self {
            connections: Arc::new(RwLock::new(HashMap::new())),
            pool_cache: Arc::new(TokioRwLock::new(HashMap::new())),
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

    /// Remove the connection metadata (use `close_pool` first to free DB connections).
    pub fn remove(&self, id: &str) -> bool {
        self.connections.write().remove(id).is_some()
    }

    /// Return an existing pool from the cache, or lazily create one for the given connection id.
    pub async fn get_or_create_pool(&self, id: &str) -> Result<AnyPool> {
        // Fast path: pool already cached.
        {
            let read = self.pool_cache.read().await;
            if let Some(pool) = read.get(id) {
                return Ok(pool.clone());
            }
        }
        // Slow path: open a new persistent pool.
        let info = self.get(id).ok_or(AppError::DatabaseNotFound)?;
        let new_pool = AnyPoolOptions::new()
            .max_connections(5)
            .connect(&info.connection_string)
            .await
            .map_err(|e| AppError::DatabaseConnectionError(e.to_string()))?;

        // Double-checked insert to avoid races.
        let mut write = self.pool_cache.write().await;
        if let Some(existing) = write.get(id) {
            new_pool.close().await;
            return Ok(existing.clone());
        }
        write.insert(id.to_string(), new_pool.clone());
        Ok(new_pool)
    }

    /// Close and evict the pool for a connection (call before `remove`).
    pub async fn close_pool(&self, id: &str) {
        let mut write = self.pool_cache.write().await;
        if let Some(pool) = write.remove(id) {
            pool.close().await;
        }
    }
}

impl Default for DatabaseRegistry {
    fn default() -> Self {
        Self::new()
    }
}
