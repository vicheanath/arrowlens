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
