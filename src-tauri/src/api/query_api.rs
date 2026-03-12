use std::sync::Arc;

use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::cache::app_store::AppStore;
use crate::engine::database_registry::DatabaseType;
use crate::engine::database_registry::DatabaseRegistry;
use crate::engine::dataset_registry::DatasetRegistry;
use crate::engine::query_executor::{ExecutionTarget, ExecutorFactory};
use crate::error::{AppError, Result};
use crate::state::active_queries;
use crate::streaming::result_serializer::QueryResult;

/// Query history stored in-process and restored from persisted app state.
static HISTORY: once_cell::sync::Lazy<parking_lot::Mutex<Vec<HistoryEntry>>> =
    once_cell::sync::Lazy::new(|| parking_lot::Mutex::new(Vec::new()));

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SqlTemplateKind {
    WorkspaceDefault,
    SelectAll,
    SelectColumn,
    Count,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct HistoryEntry {
    pub id: String,
    pub sql: String,
    pub executed_at: String,
    pub elapsed_ms: Option<u64>,
    pub row_count: Option<usize>,
    pub error: Option<String>,
}

pub fn restore_history(entries: Vec<HistoryEntry>) {
    let mut lock = HISTORY.lock();
    *lock = entries;
    if lock.len() > 200 {
        let overflow = lock.len() - 200;
        lock.drain(0..overflow);
    }
}

/// Execute a SQL query and return all results at once.
/// If `connection_id` is provided, routes to an external DB; otherwise uses DataFusion on loaded datasets.
#[tauri::command]
pub async fn run_query(
    sql: String,
    connection_id: Option<String>,
    registry: State<'_, Arc<DatasetRegistry>>,
    db_registry: State<'_, Arc<DatabaseRegistry>>,
    app_store: State<'_, Arc<AppStore>>,
) -> Result<QueryResult> {
    if sql.trim().is_empty() {
        return Err(AppError::QuerySyntaxError("Query cannot be empty".to_string()));
    }

    let target = match connection_id {
        Some(id) => {
            log::info!("[Query Execute] backend=database connection_id={}", id);
            ExecutionTarget::Database { connection_id: id }
        }
        None => {
            log::info!("[Query Execute] backend=datafusion");
            ExecutionTarget::Datasets
        }
    };
    let factory = ExecutorFactory::new(registry.inner().clone(), db_registry.inner().clone());
    let executor = factory.resolve(target)?;
    let result = executor.execute(&sql).await?;

    record_history(
        &sql,
        Some(result.elapsed_ms),
        Some(result.row_count),
        None,
        app_store.inner().as_ref(),
    );

    Ok(result)
}

/// Execute a SQL query and stream results back as Tauri events.
/// If `connection_id` is provided, routes to an external DB; otherwise uses DataFusion on loaded datasets.
/// Returns the query_id immediately; frontend listens for `query-chunk-{query_id}`.
#[tauri::command]
pub async fn run_query_streaming(
    sql: String,
    connection_id: Option<String>,
    chunk_size: Option<usize>,
    app: AppHandle,
    registry: State<'_, Arc<DatasetRegistry>>,
    db_registry: State<'_, Arc<DatabaseRegistry>>,
    app_store: State<'_, Arc<AppStore>>,
) -> Result<String> {
    if sql.trim().is_empty() {
        return Err(AppError::QuerySyntaxError("Query cannot be empty".to_string()));
    }

    let query_id = Uuid::new_v4().to_string();
    let chunk_size = chunk_size.unwrap_or(500);
    let registry_clone = registry.inner().clone();
    let db_registry_clone = db_registry.inner().clone();
    let app_clone = app.clone();
    let qid = query_id.clone();
    let sql_clone = sql.clone();
    let target = match connection_id {
        Some(id) => {
            log::info!("[Streaming Query Execute] backend=database connection_id={}", id);
            ExecutionTarget::Database { connection_id: id }
        }
        None => {
            log::info!("[Streaming Query Execute] backend=datafusion");
            ExecutionTarget::Datasets
        }
    };

    // Register the query
    active_queries::register_query(&qid);
    let qid_cleanup = qid.clone();

    tokio::spawn(async move {
        let factory = ExecutorFactory::new(registry_clone, db_registry_clone);
        let executor = match factory.resolve(target) {
            Ok(executor) => executor,
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

        match executor
            .execute_streaming(app_clone.clone(), qid.clone(), &sql_clone, chunk_size)
            .await
        {
            Ok(_) => {
                active_queries::complete(&qid);
            }
            Err(e) => {
                let _ = tauri::Emitter::emit(
                    &app_clone,
                    &format!("query-error-{}", qid),
                    e.to_response(Some(sql_clone.clone())),
                );
            }
        }

        // Clean up query state
        active_queries::cleanup(&qid_cleanup);
    });

    record_history(&sql, None, None, None, app_store.inner().as_ref());
    Ok(query_id)
}

/// Cancel a streaming query.
/// Sets a flag that the streaming endpoint checks to stop sending results.
#[tauri::command]
pub async fn cancel_query(query_id: String) -> Result<()> {
    active_queries::cancel(&query_id);
    Ok(())
}

/// Return the in-memory query history (most recent first).
#[tauri::command]
pub async fn get_query_history() -> Result<Vec<HistoryEntry>> {
    let lock = HISTORY.lock();
    let mut entries = lock.clone();
    entries.reverse();
    Ok(entries)
}

#[tauri::command]
pub async fn build_sql_template(
    template_kind: SqlTemplateKind,
    connection_id: Option<String>,
    table_name: Option<String>,
    column_name: Option<String>,
    limit: Option<usize>,
    db_registry: State<'_, Arc<DatabaseRegistry>>,
) -> Result<String> {
    let dialect = resolve_sql_dialect(connection_id.as_deref(), db_registry.inner().as_ref())?;
    let resolved_limit = limit.unwrap_or(100);

    match template_kind {
        SqlTemplateKind::WorkspaceDefault => Ok(build_workspace_default_sql(dialect)),
        SqlTemplateKind::SelectAll => {
            let table = table_name.ok_or_else(|| {
                AppError::QuerySyntaxError("Table name is required for SELECT template".to_string())
            })?;
            Ok(build_select_all_sql(&table, resolved_limit, dialect))
        }
        SqlTemplateKind::SelectColumn => {
            let table = table_name.ok_or_else(|| {
                AppError::QuerySyntaxError("Table name is required for column template".to_string())
            })?;
            let column = column_name.ok_or_else(|| {
                AppError::QuerySyntaxError("Column name is required for column template".to_string())
            })?;
            Ok(build_select_column_sql(&table, &column, resolved_limit, dialect))
        }
        SqlTemplateKind::Count => {
            let table = table_name.unwrap_or_else(|| "table_name".to_string());
            Ok(build_count_sql(&table, dialect))
        }
    }
}

/// Run EXPLAIN on a SQL query and return the query plan as a string.
/// If `connection_id` is provided, routes to an external DB (e.g. PostgreSQL);
/// otherwise uses DataFusion on loaded datasets.
#[tauri::command]
pub async fn explain_query(
    sql: String,
    verbose: Option<bool>,
    connection_id: Option<String>,
    registry: State<'_, Arc<DatasetRegistry>>,
    db_registry: State<'_, Arc<DatabaseRegistry>>,
) -> Result<String> {
    if sql.trim().is_empty() {
        return Err(AppError::QuerySyntaxError("Query cannot be empty".to_string()));
    }

    let verbose = verbose.unwrap_or(false);
    let factory = ExecutorFactory::new(registry.inner().clone(), db_registry.inner().clone());

    let (target, explain_sql) = match connection_id {
        Some(id) => {
            let connection = db_registry
                .get(&id)
                .ok_or(AppError::DatabaseNotFound)?;

            let esql = match connection.database_type {
                DatabaseType::Postgres => build_postgres_explain_sql(&sql, verbose),
                DatabaseType::Mysql => {
                    if verbose {
                        format!("EXPLAIN ANALYZE {}", sql)
                    } else {
                        format!("EXPLAIN {}", sql)
                    }
                }
                DatabaseType::Sqlite => format!("EXPLAIN QUERY PLAN {}", sql),
            };

            (ExecutionTarget::Database { connection_id: id }, esql)
        }
        None => {
            // DataFusion supports EXPLAIN VERBOSE
            let esql = if verbose {
                format!("EXPLAIN VERBOSE {}", sql)
            } else {
                format!("EXPLAIN {}", sql)
            };
            (ExecutionTarget::Datasets, esql)
        }
    };

    let executor = factory.resolve(target)?;

    let result = executor.execute(&explain_sql)
        .await
        .map_err(|_| {
            // DataFusion EXPLAIN returns rows, not an error — this handles edge cases
            AppError::QueryError("Failed to generate query plan".to_string())
        })?;

    // Concatenate plan rows into a single string for display
    let plan_lines: Vec<String> = result.rows.iter().map(|row| {
        row.iter()
            .map(|v| match v {
                serde_json::Value::String(s) => s.clone(),
                other => other.to_string(),
            })
            .collect::<Vec<_>>()
            .join("  ")
    }).collect();

    Ok(plan_lines.join("\n"))
}

fn build_postgres_explain_sql(sql: &str, analyze: bool) -> String {
    if analyze {
        format!(
            "EXPLAIN (ANALYZE, VERBOSE, BUFFERS, FORMAT TEXT) {}",
            sql
        )
    } else {
        format!("EXPLAIN (VERBOSE, FORMAT TEXT) {}", sql)
    }
}

fn resolve_sql_dialect(
    connection_id: Option<&str>,
    db_registry: &DatabaseRegistry,
) -> Result<Option<DatabaseType>> {
    match connection_id {
        Some(id) => db_registry
            .get(id)
            .map(|connection| Some(connection.database_type))
            .ok_or(AppError::DatabaseNotFound),
        None => Ok(None),
    }
}

fn build_workspace_default_sql(dialect: Option<DatabaseType>) -> String {
    let label = dialect_label(dialect);
    let example_table = if dialect.is_none() { "my_table" } else { "users" };
    let example_identifier = quote_identifier(example_table, dialect);

    format!(
        "-- ArrowLens SQL Workspace\n-- Active dialect: {}\n-- Example:\n-- SELECT * FROM {} LIMIT 100;\n",
        label, example_identifier
    )
}

fn build_select_all_sql(table_name: &str, limit: usize, dialect: Option<DatabaseType>) -> String {
    let table = resolve_table_identifier(table_name, dialect);
    format!("SELECT *\nFROM {}\nLIMIT {};", table, limit)
}

fn build_select_column_sql(
    table_name: &str,
    column_name: &str,
    limit: usize,
    dialect: Option<DatabaseType>,
) -> String {
    let table = resolve_table_identifier(table_name, dialect);
    let column = quote_identifier(column_name, dialect);
    format!("SELECT {}\nFROM {}\nLIMIT {};", column, table, limit)
}

fn build_count_sql(table_name: &str, dialect: Option<DatabaseType>) -> String {
    let table = resolve_table_identifier(table_name, dialect);
    format!("SELECT COUNT(*) AS total\nFROM {};", table)
}

fn resolve_table_identifier(table_name: &str, dialect: Option<DatabaseType>) -> String {
    let resolved = if dialect.is_none() {
        sanitize_table_name(table_name)
    } else {
        table_name.to_string()
    };

    quote_identifier(&resolved, dialect)
}

fn quote_identifier(identifier: &str, dialect: Option<DatabaseType>) -> String {
    let quote_part = |part: &str| match dialect {
        Some(DatabaseType::Mysql) => format!("`{}`", part.replace('`', "``")),
        _ => format!("\"{}\"", part.replace('"', "\"\"")),
    };

    identifier
        .split('.')
        .filter(|part| !part.is_empty())
        .map(quote_part)
        .collect::<Vec<_>>()
        .join(".")
}

fn dialect_label(dialect: Option<DatabaseType>) -> &'static str {
    match dialect {
        Some(DatabaseType::Sqlite) => "SQLite",
        Some(DatabaseType::Mysql) => "MySQL",
        Some(DatabaseType::Postgres) => "PostgreSQL",
        None => "DataFusion",
    }
}

fn sanitize_table_name(name: &str) -> String {
    let sanitized = name
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '_' {
                character
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim_start_matches(|character: char| character.is_ascii_digit())
        .to_lowercase();

    if sanitized.is_empty() {
        "dataset".to_string()
    } else {
        sanitized
    }
}

fn record_history(
    sql: &str,
    elapsed_ms: Option<u64>,
    row_count: Option<usize>,
    error: Option<String>,
    app_store: &AppStore,
) {
    let entry = HistoryEntry {
        id: Uuid::new_v4().to_string(),
        sql: sql.to_string(),
        executed_at: chrono::Utc::now().to_rfc3339(),
        elapsed_ms,
        row_count,
        error,
    };
    let snapshot = {
        let mut lock = HISTORY.lock();
        lock.push(entry);
        // Keep at most 200 entries
        if lock.len() > 200 {
            lock.remove(0);
        }
        lock.clone()
    };

    if let Err(e) = app_store.save_query_history(&snapshot) {
        log::error!("Failed to persist query history: {}", e);
    }
}
