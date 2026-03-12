use std::sync::Arc;
use std::time::Instant;

use sqlx::{any::AnyPoolOptions, AnyPool, Column, Row, TypeInfo};
use tauri::{AppHandle, State};

use crate::engine::database_registry::{DatabaseConnectionInfo, DatabaseRegistry, DatabaseType};
use crate::error::{AppError, Result};
use crate::streaming::result_serializer::QueryResult;

#[tauri::command]
pub async fn connect_database(
    database_type: DatabaseType,
    connection_string: String,
    name: Option<String>,
    registry: State<'_, Arc<DatabaseRegistry>>,
) -> Result<DatabaseConnectionInfo> {
    let normalized = normalize_connection_string(&database_type, &connection_string);
    validate_connection(&normalized).await?;

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
    Ok(registry.remove(&id))
}

#[tauri::command]
pub async fn list_database_tables(
    connection_id: String,
    registry: State<'_, Arc<DatabaseRegistry>>,
) -> Result<Vec<String>> {
    let info = registry
        .get(&connection_id)
        .ok_or_else(|| AppError::DatabaseNotFound)?;

    let pool = open_pool(&info.connection_string).await?;

    let sql = match info.database_type {
        DatabaseType::Sqlite => {
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        }
        DatabaseType::Mysql => {
            "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name"
        }
        DatabaseType::Postgres => {
            "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
        }
    };

    let rows = sqlx::query(sql)
        .fetch_all(&pool)
        .await
        .map_err(|e| AppError::DatabaseQueryError(e.to_string()))?;

    let mut tables = Vec::with_capacity(rows.len());
    for row in rows {
        let name = row.try_get::<String, _>(0)
            .map_err(|e| AppError::DatabaseQueryError(e.to_string()))?;
        tables.push(name);
    }

    pool.close().await;
    Ok(tables)
}

#[tauri::command]
pub async fn run_database_query(
    connection_id: String,
    sql: String,
    limit: Option<usize>,
    registry: State<'_, Arc<DatabaseRegistry>>,
) -> Result<QueryResult> {
    if sql.trim().is_empty() {
        return Err(AppError::QuerySyntaxError("Query cannot be empty".to_string()));
    }

    let info = registry
        .get(&connection_id)
        .ok_or_else(|| AppError::DatabaseNotFound)?;

    let pool = open_pool(&info.connection_string).await?;
    let started = Instant::now();

    let rows = sqlx::query(&sql)
        .fetch_all(&pool)
        .await
        .map_err(|e| AppError::DatabaseQueryError(e.to_string()))?;

    let max_rows = limit.unwrap_or(10_000);
    let clipped = rows.into_iter().take(max_rows).collect::<Vec<_>>();

    let (columns, column_types) = if let Some(first) = clipped.first() {
        let cols = first
            .columns()
            .iter()
            .map(|c| c.name().to_string())
            .collect::<Vec<String>>();
        let types = first
            .columns()
            .iter()
            .map(|c| c.type_info().name().to_string())
            .collect::<Vec<String>>();
        (cols, types)
    } else {
        (Vec::new(), Vec::new())
    };

    let mut rows_out: Vec<Vec<serde_json::Value>> = Vec::with_capacity(clipped.len());
    for row in &clipped {
        let mut out = Vec::with_capacity(row.len());
        for idx in 0..row.len() {
            out.push(any_cell_to_json(row, idx));
        }
        rows_out.push(out);
    }

    pool.close().await;

    Ok(QueryResult {
        columns,
        column_types,
        row_count: rows_out.len(),
        rows: rows_out,
        elapsed_ms: started.elapsed().as_millis() as u64,
    })
}

/// Stream database query results back as Tauri events with pagination.
/// Returns the query_id immediately; frontend listens for `query-chunk-{query_id}`.
#[tauri::command]
pub async fn run_database_query_streaming(
    connection_id: String,
    sql: String,
    chunk_size: Option<usize>,
    app: AppHandle,
    registry: State<'_, Arc<DatabaseRegistry>>,
) -> Result<String> {
    use uuid::Uuid;
    use crate::state::active_queries;
    use crate::streaming::record_batch_stream::StreamChunk;

    if sql.trim().is_empty() {
        return Err(AppError::QuerySyntaxError("Query cannot be empty".to_string()));
    }

    let query_id = Uuid::new_v4().to_string();
    let chunk_size = chunk_size.unwrap_or(500);
    let registry_clone = registry.inner().clone();
    let app_clone = app.clone();
    let qid = query_id.clone();
    let sql_clone = sql.clone();
    let conn_id = connection_id.clone();
    let qid_cleanup = qid.clone();

    // Register the query
    active_queries::register_query(&qid);

    tokio::spawn(async move {
        // Check if cancelled before starting
        if active_queries::is_cancelled(&qid) {
            let _ = tauri::Emitter::emit(
                &app_clone,
                &format!("query-error-{}", qid),
                AppError::QueryCancelled.to_response(Some(sql_clone.clone())),
            );
            active_queries::cleanup(&qid_cleanup);
            return;
        }

        let info = match registry_clone.get(&conn_id) {
            Some(info) => info,
            None => {
                let _ = tauri::Emitter::emit(
                    &app_clone,
                    &format!("query-error-{}", qid),
                    AppError::DatabaseNotFound.to_response(None),
                );
                active_queries::cleanup(&qid_cleanup);
                return;
            }
        };

        let pool = match open_pool(&info.connection_string).await {
            Ok(p) => p,
            Err(e) => {
                let _ = tauri::Emitter::emit(
                    &app_clone,
                    &format!("query-error-{}", qid),
                    e.to_response(Some(sql_clone.clone())),
                );
                active_queries::cleanup(&qid_cleanup);
                return;
            }
        };

        // Fetch all rows (SQLx doesn't support true async streaming without cursors on all DBs)
        let rows = match sqlx::query(&sql_clone)
            .fetch_all(&pool)
            .await
        {
            Ok(r) => r,
            Err(e) => {
                let _ = tauri::Emitter::emit(
                    &app_clone,
                    &format!("query-error-{}", qid),
                    AppError::DatabaseQueryError(e.to_string()).to_response(Some(sql_clone.clone())),
                );
                active_queries::cleanup(&qid_cleanup);
                pool.close().await;
                return;
            }
        };

        // Get column info from first row
        let (columns, _column_types) = if let Some(first) = rows.first() {
            let cols = first
                .columns()
                .iter()
                .map(|c| c.name().to_string())
                .collect::<Vec<_>>();
            let types = first
                .columns()
                .iter()
                .map(|c| c.type_info().name().to_string())
                .collect::<Vec<_>>();
            (cols, types)
        } else {
            (vec![], vec![])
        };

        // Stream results in chunks
        let mut chunk_index = 0usize;
        for chunk in rows.chunks(chunk_size) {
            // Check cancellation
            if active_queries::is_cancelled(&qid) {
                let _ = tauri::Emitter::emit(
                    &app_clone,
                    &format!("query-chunk-{}", qid),
                    StreamChunk {
                        query_id: qid.clone(),
                        chunk_index,
                        columns: columns.clone(),
                        rows: vec![],
                        row_count: 0,
                        done: true,
                    },
                );
                active_queries::cleanup(&qid_cleanup);
                pool.close().await;
                return;
            }

            // Convert rows to JSON values
            let mut rows_json = Vec::new();
            for row in chunk {
                let mut row_vals = Vec::new();
                for idx in 0..columns.len() {
                    row_vals.push(any_cell_to_json(row, idx));
                }
                rows_json.push(row_vals);
            }

            // Emit chunk
            let _ = tauri::Emitter::emit(
                &app_clone,
                &format!("query-chunk-{}", qid),
                StreamChunk {
                    query_id: qid.clone(),
                    chunk_index,
                    columns: columns.clone(),
                    row_count: rows_json.len(),
                    rows: rows_json,
                    done: false,
                },
            );
            chunk_index += 1;
        }

        // Emit completion signal
        let _ = tauri::Emitter::emit(
            &app_clone,
            &format!("query-chunk-{}", qid),
            StreamChunk {
                query_id: qid.clone(),
                chunk_index,
                columns,
                rows: vec![],
                row_count: 0,
                done: true,
            },
        );

        active_queries::complete(&qid);
        active_queries::cleanup(&qid_cleanup);
        pool.close().await;
    });

    Ok(query_id)
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

async fn validate_connection(connection_string: &str) -> Result<()> {
    let pool = AnyPoolOptions::new()
        .max_connections(1)
        .connect(connection_string)
        .await
        .map_err(|e| AppError::DatabaseConnectionError(e.to_string()))?;
    pool.close().await;
    Ok(())
}

async fn open_pool(connection_string: &str) -> Result<AnyPool> {
    AnyPoolOptions::new()
        .max_connections(1)
        .connect(connection_string)
        .await
        .map_err(|e| AppError::DatabaseConnectionError(e.to_string()))
}

fn any_cell_to_json(row: &sqlx::any::AnyRow, idx: usize) -> serde_json::Value {
    if let Ok(v) = row.try_get::<Option<bool>, _>(idx) {
        return v.map(serde_json::Value::Bool).unwrap_or(serde_json::Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<i64>, _>(idx) {
        return v
            .map(|x| serde_json::Value::Number(serde_json::Number::from(x)))
            .unwrap_or(serde_json::Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<f64>, _>(idx) {
        return v
            .and_then(serde_json::Number::from_f64)
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<String>, _>(idx) {
        return v
            .map(serde_json::Value::String)
            .unwrap_or(serde_json::Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<Vec<u8>>, _>(idx) {
        return v
            .map(|bytes| serde_json::Value::String(format!("0x{}", hex_encode(&bytes))))
            .unwrap_or(serde_json::Value::Null);
    }

    serde_json::Value::Null
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push(HEX[(b >> 4) as usize] as char);
        out.push(HEX[(b & 0x0f) as usize] as char);
    }
    out
}
