use std::sync::Arc;

use tauri::State;

use crate::engine::database_executor::DatabaseExecutor;
use crate::engine::database_registry::{DatabaseConnectionInfo, DatabaseRegistry, DatabaseType};
use crate::error::Result;

#[tauri::command]
pub async fn connect_database(
    database_type: DatabaseType,
    connection_string: String,
    name: Option<String>,
    registry: State<'_, Arc<DatabaseRegistry>>,
) -> Result<DatabaseConnectionInfo> {
    let normalized = normalize_connection_string(&database_type, &connection_string);
    DatabaseExecutor::validate_connection_string(&normalized).await?;

    let resolved_name = name.unwrap_or_else(|| default_connection_name(&database_type, &normalized));
    let info = DatabaseConnectionInfo::new(resolved_name, database_type, normalized);
    let id = registry.register(info.clone());
    Ok(registry.get(&id).unwrap_or(info))
}

#[tauri::command]
pub async fn connect_sqlite_database(
    path: String,
    name: Option<String>,
    registry: State<'_, Arc<DatabaseRegistry>>,
) -> Result<DatabaseConnectionInfo> {
    connect_database(DatabaseType::Sqlite, path, name, registry).await
}

#[tauri::command]
pub async fn list_database_connections(
    registry: State<'_, Arc<DatabaseRegistry>>,
) -> Result<Vec<DatabaseConnectionInfo>> {
    Ok(registry.list())
}

#[tauri::command]
pub async fn disconnect_database(
    id: String,
    registry: State<'_, Arc<DatabaseRegistry>>,
) -> Result<bool> {
    registry.close_pool(&id).await;
    Ok(registry.remove(&id))
}

#[tauri::command]
pub async fn list_database_tables(
    connection_id: String,
    registry: State<'_, Arc<DatabaseRegistry>>,
) -> Result<Vec<String>> {
    let executor = DatabaseExecutor::from_registry(registry.inner().clone(), &connection_id)?;
    executor.list_tables().await
}

fn normalize_connection_string(database_type: &DatabaseType, input: &str) -> String {
    let trimmed = input.trim();
    match database_type {
        DatabaseType::Sqlite => {
            if trimmed.starts_with("sqlite:") {
                trimmed.to_string()
            } else {
                format!("sqlite://{}", trimmed)
            }
        }
        DatabaseType::Mysql => trimmed.to_string(),
        DatabaseType::Postgres => trimmed.to_string(),
    }
}

fn default_connection_name(database_type: &DatabaseType, connection_string: &str) -> String {
    match database_type {
        DatabaseType::Sqlite => {
            let path = connection_string.strip_prefix("sqlite://").unwrap_or(connection_string);
            std::path::Path::new(path)
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| "sqlite_db".to_string())
        }
        DatabaseType::Mysql => "mysql_db".to_string(),
        DatabaseType::Postgres => "postgres_db".to_string(),
    }
}

