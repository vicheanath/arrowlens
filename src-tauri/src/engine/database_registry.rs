use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use chrono::{DateTime, Utc};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use sqlx::postgres::{PgPool, PgPoolOptions};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};
use sqlx::{any::AnyPoolOptions, AnyPool};
use tokio::sync::RwLock as TokioRwLock;
use uuid::Uuid;

use crate::error::{AppError, Result};

/// A bb8-managed pool of tiberius (SQL Server / TDS) connections. tiberius has no
/// native pool, so bb8 supplies bounded, reused connections like the sqlx pools.
pub type MssqlPool = bb8::Pool<bb8_tiberius::ConnectionManager>;

/// Build a tiberius [`Config`] from a stored ADO.NET-style connection string,
/// e.g. `Server=localhost,1433;Database=db;User Id=sa;Password=...;TrustServerCertificate=true`.
pub fn mssql_config(connection_string: &str) -> Result<tiberius::Config> {
    tiberius::Config::from_ado_string(connection_string)
        .map_err(|e| AppError::DatabaseConnectionError(e.to_string()))
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DatabaseType {
    Sqlite,
    Mysql,
    Postgres,
    Mssql,
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

    /// A copy safe to return to the frontend: the password in a URL-style DSN is
    /// masked so the secret never crosses the IPC boundary.
    pub fn redacted(&self) -> Self {
        let mut copy = self.clone();
        copy.connection_string = redact_connection_string(&self.connection_string);
        copy
    }
}

/// Mask the password in a connection string before it crosses the IPC boundary.
/// Handles two shapes:
/// * URL-style (`scheme://user:pass@host/db` → `scheme://user:****@host/db`).
/// * ADO.NET-style (`...;Password=secret;...` → `...;Password=****;...`), used by
///   SQL Server — masking the `Password`/`Pwd` value case-insensitively.
/// Anything else (e.g. a SQLite file path) is returned unchanged.
pub fn redact_connection_string(connection_string: &str) -> String {
    // ADO.NET-style strings have no `://` but use `;`-separated `key=value` pairs.
    if !connection_string.contains("://") && connection_string.contains('=') {
        return redact_ado_connection_string(connection_string);
    }
    let Some(scheme_end) = connection_string.find("://") else {
        return connection_string.to_string();
    };
    let after_scheme = scheme_end + 3;
    let Some(at_rel) = connection_string[after_scheme..].find('@') else {
        return connection_string.to_string();
    };
    let at = after_scheme + at_rel;
    let authority = &connection_string[after_scheme..at];
    match authority.find(':') {
        Some(colon) => {
            let user = &connection_string[after_scheme..after_scheme + colon];
            format!(
                "{}{}:****{}",
                &connection_string[..after_scheme],
                user,
                &connection_string[at..]
            )
        }
        None => connection_string.to_string(),
    }
}

/// Mask the `Password`/`Pwd` value in an ADO.NET-style connection string,
/// preserving every other key=value pair and the original separators.
fn redact_ado_connection_string(connection_string: &str) -> String {
    connection_string
        .split(';')
        .map(|segment| {
            let key = segment.split('=').next().unwrap_or("").trim();
            if key.eq_ignore_ascii_case("password") || key.eq_ignore_ascii_case("pwd") {
                match segment.find('=') {
                    Some(eq) => format!("{}=****", &segment[..eq]),
                    None => segment.to_string(),
                }
            } else {
                segment.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join(";")
}

/// Thread-safe registry for multiple database connections with a shared pool cache.
pub struct DatabaseRegistry {
    connections: Arc<RwLock<HashMap<String, DatabaseConnectionInfo>>>,
    /// Lazily-created persistent pools keyed by connection id (used for MySQL
    /// and connection-string validation via the `any` driver).
    pool_cache: Arc<TokioRwLock<HashMap<String, AnyPool>>>,
    /// Lazily-created, reused Postgres pools keyed by connection id.
    pg_pool_cache: Arc<TokioRwLock<HashMap<String, PgPool>>>,
    /// Lazily-created, reused SQLite pools keyed by connection id.
    sqlite_pool_cache: Arc<TokioRwLock<HashMap<String, SqlitePool>>>,
    /// Lazily-created, reused SQL Server (tiberius/bb8) pools keyed by connection id.
    mssql_pool_cache: Arc<TokioRwLock<HashMap<String, MssqlPool>>>,
}

impl DatabaseRegistry {
    pub fn new() -> Self {
        Self {
            connections: Arc::new(RwLock::new(HashMap::new())),
            pool_cache: Arc::new(TokioRwLock::new(HashMap::new())),
            pg_pool_cache: Arc::new(TokioRwLock::new(HashMap::new())),
            sqlite_pool_cache: Arc::new(TokioRwLock::new(HashMap::new())),
            mssql_pool_cache: Arc::new(TokioRwLock::new(HashMap::new())),
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

    pub fn restore_connections_list(&self, connections: Vec<DatabaseConnectionInfo>) {
        let mut lock = self.connections.write();
        lock.clear();

        for conn in connections {
            lock.insert(conn.id.clone(), conn);
        }
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

    /// Return a reused Postgres pool for the connection, creating it on first use.
    /// Pools are bounded and have an idle timeout so connections are released
    /// when unused — this prevents exhausting the server's connection limit when
    /// many connections (or many queries) are active.
    pub async fn get_or_create_pg_pool(&self, id: &str) -> Result<PgPool> {
        {
            let read = self.pg_pool_cache.read().await;
            if let Some(pool) = read.get(id) {
                return Ok(pool.clone());
            }
        }
        let info = self.get(id).ok_or(AppError::DatabaseNotFound)?;
        let new_pool = PgPoolOptions::new()
            .max_connections(5)
            .acquire_timeout(Duration::from_secs(15))
            .idle_timeout(Duration::from_secs(300))
            .connect(&info.connection_string)
            .await
            .map_err(|e| AppError::DatabaseConnectionError(e.to_string()))?;

        let mut write = self.pg_pool_cache.write().await;
        if let Some(existing) = write.get(id) {
            new_pool.close().await;
            return Ok(existing.clone());
        }
        write.insert(id.to_string(), new_pool.clone());
        Ok(new_pool)
    }

    /// Return a reused SQLite pool for the connection, creating it on first use.
    pub async fn get_or_create_sqlite_pool(&self, id: &str) -> Result<SqlitePool> {
        {
            let read = self.sqlite_pool_cache.read().await;
            if let Some(pool) = read.get(id) {
                return Ok(pool.clone());
            }
        }
        let info = self.get(id).ok_or(AppError::DatabaseNotFound)?;
        // Open SQLite by filesystem path (not a URL) so Windows paths with drive
        // letters and backslashes are handled correctly.
        let options = SqliteConnectOptions::new()
            .filename(sqlite_path(&info.connection_string))
            .create_if_missing(false);
        let new_pool = SqlitePoolOptions::new()
            .max_connections(4)
            .acquire_timeout(Duration::from_secs(15))
            .idle_timeout(Duration::from_secs(300))
            .connect_with(options)
            .await
            .map_err(|e| AppError::DatabaseConnectionError(e.to_string()))?;

        let mut write = self.sqlite_pool_cache.write().await;
        if let Some(existing) = write.get(id) {
            new_pool.close().await;
            return Ok(existing.clone());
        }
        write.insert(id.to_string(), new_pool.clone());
        Ok(new_pool)
    }

    /// Return a reused SQL Server pool for the connection, creating it on first
    /// use. tiberius has no native pool, so bb8 bounds and reuses connections —
    /// matching the Postgres/SQLite pools and protecting the server's connection
    /// limit. The connection string is an ADO.NET-style string.
    pub async fn get_or_create_mssql_pool(&self, id: &str) -> Result<MssqlPool> {
        {
            let read = self.mssql_pool_cache.read().await;
            if let Some(pool) = read.get(id) {
                return Ok(pool.clone());
            }
        }
        let info = self.get(id).ok_or(AppError::DatabaseNotFound)?;
        let config = mssql_config(&info.connection_string)?;
        let manager = bb8_tiberius::ConnectionManager::new(config);
        let new_pool = bb8::Pool::builder()
            .max_size(5)
            .connection_timeout(Duration::from_secs(15))
            .idle_timeout(Some(Duration::from_secs(300)))
            .build(manager)
            .await
            .map_err(|e| AppError::DatabaseConnectionError(e.to_string()))?;

        let mut write = self.mssql_pool_cache.write().await;
        if let Some(existing) = write.get(id) {
            return Ok(existing.clone());
        }
        write.insert(id.to_string(), new_pool.clone());
        Ok(new_pool)
    }

    /// Close and evict all cached pools for a connection (call before `remove`).
    pub async fn close_pool(&self, id: &str) {
        if let Some(pool) = self.pool_cache.write().await.remove(id) {
            pool.close().await;
        }
        if let Some(pool) = self.pg_pool_cache.write().await.remove(id) {
            pool.close().await;
        }
        if let Some(pool) = self.sqlite_pool_cache.write().await.remove(id) {
            pool.close().await;
        }
        // bb8 has no async close — dropping the pool closes its connections.
        self.mssql_pool_cache.write().await.remove(id);
    }
}

impl Default for DatabaseRegistry {
    fn default() -> Self {
        Self::new()
    }
}

/// Extract the filesystem path from a stored SQLite connection string,
/// tolerating an optional `sqlite:` / `sqlite://` scheme prefix.
pub fn sqlite_path(connection_string: &str) -> String {
    let trimmed = connection_string.trim();
    trimmed
        .strip_prefix("sqlite://")
        .or_else(|| trimmed.strip_prefix("sqlite:"))
        .unwrap_or(trimmed)
        .to_string()
}

/// Validate that a SQLite database file can be opened (by path, not URL).
pub async fn validate_sqlite_file(connection_string: &str) -> Result<()> {
    let options = SqliteConnectOptions::new()
        .filename(sqlite_path(connection_string))
        .create_if_missing(false);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .map_err(|e| AppError::DatabaseConnectionError(e.to_string()))?;
    pool.close().await;
    Ok(())
}
