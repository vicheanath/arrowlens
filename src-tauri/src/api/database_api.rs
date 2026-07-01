use std::sync::Arc;

use tauri::State;

use crate::cache::app_store::AppStore;
use crate::cache::secrets;
use crate::engine::database_executor::DatabaseSchemaEntry;
use crate::engine::database_executor::DatabaseExecutor;
use crate::engine::database_registry::{DatabaseConnectionInfo, DatabaseRegistry, DatabaseType};
use crate::engine::provider::provider_for;
use crate::error::{AppError, Result};

#[tauri::command]
pub async fn connect_database(
    database_type: DatabaseType,
    connection_string: String,
    name: Option<String>,
    registry: State<'_, Arc<DatabaseRegistry>>,
    app_store: State<'_, Arc<AppStore>>,
) -> Result<DatabaseConnectionInfo> {
    let provider = provider_for(database_type);
    let normalized = provider.normalize_connection_string(&connection_string);
    provider.validate(&normalized).await?;

    let resolved_name = name.unwrap_or_else(|| provider.default_connection_name(&normalized));
    let info = DatabaseConnectionInfo::new(resolved_name, database_type, normalized);
    let id = registry.register(info.clone());
    let resolved = registry.get(&id).unwrap_or(info);

    app_store
        .save_database_connections(&registry.list())?;

    // Never return the raw secret (password) to the frontend.
    Ok(resolved.redacted())
}

/// Open and immediately close a connection to confirm a connection string is
/// reachable — without registering or persisting anything. Backs the "Test
/// connection" affordance in the New Connection form.
#[tauri::command]
pub async fn test_connection(
    database_type: DatabaseType,
    connection_string: String,
) -> Result<()> {
    let provider = provider_for(database_type);
    let normalized = provider.normalize_connection_string(&connection_string);
    provider.validate(&normalized).await
}

#[tauri::command]
pub async fn connect_sqlite_database(
    path: String,
    name: Option<String>,
    registry: State<'_, Arc<DatabaseRegistry>>,
    app_store: State<'_, Arc<AppStore>>,
) -> Result<DatabaseConnectionInfo> {
    connect_database(DatabaseType::Sqlite, path, name, registry, app_store).await
}

#[tauri::command]
pub async fn list_database_connections(
    registry: State<'_, Arc<DatabaseRegistry>>,
) -> Result<Vec<DatabaseConnectionInfo>> {
    Ok(registry.list().iter().map(|c| c.redacted()).collect())
}

#[tauri::command]
pub async fn disconnect_database(
    id: String,
    registry: State<'_, Arc<DatabaseRegistry>>,
    app_store: State<'_, Arc<AppStore>>,
) -> Result<bool> {
    registry.close_pool(&id).await;
    let removed = registry.remove(&id);

    // Drop the secret from the keychain along with the connection.
    secrets::delete_secret(&secrets::db_account(&id));

    app_store
        .save_database_connections(&registry.list())?;

    Ok(removed)
}

#[tauri::command]
pub async fn list_database_tables(
    connection_id: String,
    registry: State<'_, Arc<DatabaseRegistry>>,
) -> Result<Vec<String>> {
    let executor = DatabaseExecutor::from_registry(registry.inner().clone(), &connection_id)?;
    executor.list_tables().await
}

#[tauri::command]
pub async fn list_database_schema_tree(
    connection_id: String,
    registry: State<'_, Arc<DatabaseRegistry>>,
) -> Result<Vec<DatabaseSchemaEntry>> {
    let executor = DatabaseExecutor::from_registry(registry.inner().clone(), &connection_id)?;
    executor.list_schema_tree().await
}

// --- Object inspector: columns, keys, and relationships ---------------------

#[derive(Debug, Clone, serde::Serialize)]
pub struct InspectedColumnDto {
    pub name: String,
    pub data_type: String,
    pub nullable: bool,
    pub is_primary_key: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct InspectedForeignKeyDto {
    pub from_table: String,
    pub from_column: String,
    pub to_table: String,
    pub to_column: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct InspectedTableDto {
    pub schema: String,
    pub name: String,
    pub qualified_name: String,
    pub columns: Vec<InspectedColumnDto>,
    pub row_estimate: Option<i64>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ConnectionSchemaDto {
    pub tables: Vec<InspectedTableDto>,
    pub foreign_keys: Vec<InspectedForeignKeyDto>,
}

/// Introspect a connection's tables, columns, primary keys, and foreign keys —
/// the data behind the sidebar object inspector and DDL viewer.
#[tauri::command]
pub async fn get_connection_schema(
    connection_id: String,
    registry: State<'_, Arc<DatabaseRegistry>>,
) -> Result<ConnectionSchemaDto> {
    let info = registry.get(&connection_id).ok_or(AppError::DatabaseNotFound)?;
    let provider = provider_for(info.database_type);
    let introspection = provider
        .introspect_schema(registry.inner().as_ref(), &connection_id)
        .await?;

    Ok(ConnectionSchemaDto {
        tables: introspection
            .tables
            .into_iter()
            .map(|t| InspectedTableDto {
                schema: t.schema,
                name: t.name,
                qualified_name: t.qualified_name,
                columns: t
                    .columns
                    .into_iter()
                    .map(|c| InspectedColumnDto {
                        name: c.name,
                        data_type: c.data_type,
                        nullable: c.nullable,
                        is_primary_key: c.is_primary_key,
                    })
                    .collect(),
                row_estimate: t.row_estimate,
            })
            .collect(),
        foreign_keys: introspection
            .foreign_keys
            .into_iter()
            .map(|f| InspectedForeignKeyDto {
                from_table: f.from_table,
                from_column: f.from_column,
                to_table: f.to_table,
                to_column: f.to_column,
            })
            .collect(),
    })
}

