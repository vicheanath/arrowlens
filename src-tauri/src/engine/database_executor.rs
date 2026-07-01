use std::sync::Arc;
use std::time::Instant;

use async_trait::async_trait;
use tauri::{AppHandle, Emitter};

use crate::engine::database_registry::{DatabaseConnectionInfo, DatabaseRegistry};
use crate::engine::provider::{emit_stream, provider_for, DatabaseProvider};
use crate::engine::query_executor::QueryExecutor;
use crate::error::{AppError, Result};
use crate::state::active_queries;
use crate::streaming::result_serializer::{QueryResult, MAX_RESULT_ROWS};

/// Maximum rows materialized for a non-streaming query (shared across every
/// execution path).
const MAX_COLLECTED_ROWS: usize = MAX_RESULT_ROWS;

/// Adapts a [`DatabaseProvider`] to the [`QueryExecutor`] interface. All
/// engine-specific behavior lives in the provider; this type only orchestrates.
pub struct DatabaseExecutor {
    registry: Arc<DatabaseRegistry>,
    connection_id: String,
    provider: Box<dyn DatabaseProvider>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct DatabaseTableEntry {
    pub schema: String,
    pub name: String,
    pub full_name: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct DatabaseSchemaEntry {
    pub name: String,
    pub tables: Vec<DatabaseTableEntry>,
}

impl DatabaseExecutor {
    pub fn new(
        registry: Arc<DatabaseRegistry>,
        connection_id: String,
        info: DatabaseConnectionInfo,
    ) -> Self {
        Self {
            provider: provider_for(info.database_type),
            registry,
            connection_id,
        }
    }

    pub fn from_registry(registry: Arc<DatabaseRegistry>, connection_id: &str) -> Result<Self> {
        let info = registry
            .get(connection_id)
            .ok_or(AppError::DatabaseNotFound)?;
        Ok(Self::new(registry, connection_id.to_string(), info))
    }

    pub async fn list_schema_tree(&self) -> Result<Vec<DatabaseSchemaEntry>> {
        let decoded = self
            .provider
            .fetch(
                &self.registry,
                &self.connection_id,
                self.provider.schema_tree_sql(),
                None,
            )
            .await?;

        let mut schemas: Vec<DatabaseSchemaEntry> = Vec::new();
        for row in &decoded.rows {
            let schema_name = json_to_string(row.first());
            let table_name = json_to_string(row.get(1));

            let schema_index = schemas
                .iter()
                .position(|schema| schema.name == schema_name)
                .unwrap_or_else(|| {
                    schemas.push(DatabaseSchemaEntry {
                        name: schema_name.clone(),
                        tables: Vec::new(),
                    });
                    schemas.len() - 1
                });

            schemas[schema_index].tables.push(DatabaseTableEntry {
                schema: schema_name.clone(),
                name: table_name.clone(),
                full_name: format!("{}.{}", schema_name, table_name),
            });
        }

        Ok(schemas)
    }

    /// Fetch the full result set (no row cap) — used for export, where
    /// truncating to the display limit would silently drop data.
    pub async fn fetch_all(&self, sql: &str) -> Result<QueryResult> {
        let started = Instant::now();
        let decoded = self
            .provider
            .fetch(&self.registry, &self.connection_id, sql, None)
            .await?;
        Ok(decoded.into_query_result(started.elapsed().as_millis() as u64))
    }

    pub async fn list_tables(&self) -> Result<Vec<String>> {
        let qualify = self.provider.qualifies_table_names();
        let schemas = self.list_schema_tree().await?;

        let mut tables = Vec::new();
        for schema in schemas {
            for table in schema.tables {
                tables.push(if qualify { table.full_name } else { table.name });
            }
        }
        Ok(tables)
    }
}

#[async_trait]
impl QueryExecutor for DatabaseExecutor {
    async fn execute(&self, sql: &str) -> Result<QueryResult> {
        let started = Instant::now();
        // Fetch one extra row so we can tell whether the result was capped.
        let mut decoded = self
            .provider
            .fetch(
                &self.registry,
                &self.connection_id,
                sql,
                Some(MAX_COLLECTED_ROWS + 1),
            )
            .await?;
        let truncated = decoded.rows.len() > MAX_COLLECTED_ROWS;
        if truncated {
            decoded.rows.truncate(MAX_COLLECTED_ROWS);
        }
        let mut result = decoded.into_query_result(started.elapsed().as_millis() as u64);
        result.truncated = truncated;
        Ok(result)
    }

    async fn execute_page(&self, sql: &str, offset: usize, limit: usize) -> Result<QueryResult> {
        let started = Instant::now();
        let paged_sql = self.provider.page_wrap(sql, offset, limit);
        let decoded = self
            .provider
            .fetch(&self.registry, &self.connection_id, &paged_sql, Some(limit))
            .await?;
        Ok(decoded.into_query_result(started.elapsed().as_millis() as u64))
    }

    async fn execute_streaming(
        &self,
        app: AppHandle,
        query_id: String,
        sql: &str,
        chunk_size: usize,
    ) -> Result<()> {
        if active_queries::is_cancelled(&query_id) {
            let _ = app.emit(
                &format!("query-error-{}", query_id),
                AppError::QueryCancelled.to_response(Some(sql.to_string())),
            );
            return Ok(());
        }

        let decoded = self
            .provider
            .fetch(&self.registry, &self.connection_id, sql, None)
            .await?;
        emit_stream(&app, &query_id, decoded, chunk_size);
        Ok(())
    }
}

/// Coerce a JSON cell from a schema-listing query into a plain string.
fn json_to_string(value: Option<&serde_json::Value>) -> String {
    match value {
        Some(serde_json::Value::String(s)) => s.clone(),
        Some(serde_json::Value::Null) | None => String::new(),
        Some(other) => other.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use crate::engine::provider::{DatabaseProvider, MssqlProvider, SqliteProvider};

    // The default `page_wrap` (LIMIT/OFFSET) is shared by SQLite/MySQL/Postgres;
    // SqliteProvider exercises it.
    fn wrap_paged(sql: &str, offset: usize, limit: usize) -> String {
        SqliteProvider.page_wrap(sql, offset, limit)
    }

    #[test]
    fn wraps_basic_select_with_window() {
        let out = wrap_paged("SELECT * FROM users", 1000, 500);
        assert_eq!(
            out,
            "SELECT * FROM (\nSELECT * FROM users\n) AS _arrowlens_page LIMIT 500 OFFSET 1000"
        );
    }

    #[test]
    fn strips_trailing_semicolon_and_whitespace() {
        let out = wrap_paged("  SELECT 1 ;  ", 0, 100);
        assert!(out.contains("(\nSELECT 1\n)"), "got: {out}");
        assert!(out.ends_with("LIMIT 100 OFFSET 0"));
    }

    #[test]
    fn trailing_line_comment_stays_inside_the_subquery() {
        // The newline before `)` must keep a trailing `--` comment from
        // swallowing the closing paren.
        let out = wrap_paged("SELECT 1 -- note", 0, 10);
        assert!(out.contains("-- note\n)"), "got: {out}");
    }

    #[test]
    fn mssql_pages_with_offset_fetch() {
        // SQL Server has no LIMIT/OFFSET — it must use OFFSET..ROWS FETCH NEXT,
        // and OFFSET..FETCH requires an ORDER BY (we supply a stable no-op one).
        let out = MssqlProvider.page_wrap("SELECT * FROM users", 1000, 500);
        assert!(out.contains("ORDER BY (SELECT NULL)"), "got: {out}");
        assert!(
            out.ends_with("OFFSET 1000 ROWS FETCH NEXT 500 ROWS ONLY"),
            "got: {out}"
        );
        assert!(!out.contains("LIMIT"), "got: {out}");
    }
}
