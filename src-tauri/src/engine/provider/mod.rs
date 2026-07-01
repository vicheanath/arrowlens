//! Database provider abstraction.
//!
//! Every database-engine-specific concern lives behind the [`DatabaseProvider`]
//! trait: connection-string handling, validation, schema introspection, the SQL
//! used to enumerate tables, and how a result row is decoded into JSON. The rest
//! of the engine (executor, AI schema context, Tauri commands) depends only on
//! this trait, so adding a new engine means writing one module that implements
//! `DatabaseProvider` and registering it in [`provider_for`] — nothing else
//! changes (Open/Closed + Dependency-Inversion).

mod mssql;
mod mysql;
mod postgres;
mod sqlite;

use async_trait::async_trait;
use sqlx::{Column, Row, TypeInfo};
use tauri::{AppHandle, Emitter};

use crate::engine::database_registry::{DatabaseRegistry, DatabaseType};
use crate::error::{AppError, Result};
use crate::state::active_queries;
use crate::streaming::record_batch_stream::StreamChunk;
use crate::streaming::result_serializer::QueryResult;

pub use mssql::MssqlProvider;
pub use mysql::MySqlProvider;
pub use postgres::PostgresProvider;
pub use sqlite::SqliteProvider;

/// A query result decoded into JSON, before it is shaped for collection or
/// streaming. Producing this is the only DB-specific part of running a query;
/// everything downstream is shared.
pub struct DecodedRows {
    pub columns: Vec<String>,
    pub column_types: Vec<String>,
    pub rows: Vec<Vec<serde_json::Value>>,
}

impl DecodedRows {
    /// Shape decoded rows into the API result type.
    pub fn into_query_result(self, elapsed_ms: u64) -> QueryResult {
        QueryResult {
            row_count: self.rows.len(),
            columns: self.columns,
            column_types: self.column_types,
            rows: self.rows,
            elapsed_ms,
            truncated: false,
        }
    }
}

// --- Engine-neutral schema introspection ------------------------------------
// These mirror the AI `schema_context` types but live in the engine layer so
// providers don't depend on the AI module. The AI layer maps from these.

pub struct IntrospectedColumn {
    pub name: String,
    pub data_type: String,
    pub nullable: bool,
    pub is_primary_key: bool,
}

pub struct IntrospectedTable {
    pub schema: String,
    pub name: String,
    pub qualified_name: String,
    pub columns: Vec<IntrospectedColumn>,
    pub row_estimate: Option<i64>,
}

pub struct IntrospectedForeignKey {
    pub from_table: String,
    pub from_column: String,
    pub to_table: String,
    pub to_column: String,
}

/// The full set of relations + relationships a provider can introspect.
pub struct SchemaIntrospection {
    pub tables: Vec<IntrospectedTable>,
    pub foreign_keys: Vec<IntrospectedForeignKey>,
}

/// Strategy interface for one database engine. Stateless — implementations are
/// zero-sized and resolved per request via [`provider_for`].
#[async_trait]
pub trait DatabaseProvider: Send + Sync {
    /// The engine this provider serves.
    fn database_type(&self) -> DatabaseType;

    /// Dialect label used by the AI prompts and the SQL parser.
    fn dialect(&self) -> &'static str;

    /// Concrete SQL-authoring conventions for this engine (identifier quoting,
    /// string functions, LIMIT syntax, …), injected into the AI prompts so
    /// generated SQL matches the dialect actually in use.
    fn sql_dialect_guidance(&self) -> &'static str;

    /// SQL returning `(schema_name, table_name)` rows for the schema tree.
    fn schema_tree_sql(&self) -> &'static str;

    /// Wrap a query so it returns its execution plan. `analyze` requests a real
    /// run with timing/row counts where the engine supports it.
    fn explain_sql(&self, sql: &str, analyze: bool) -> String;

    /// Wrap a single read query in a windowed (paged) form for lazy pagination.
    /// The default emits standard `LIMIT n OFFSET m` (SQLite/MySQL/Postgres);
    /// engines without that syntax (SQL Server) override this.
    fn page_wrap(&self, inner: &str, offset: usize, limit: usize) -> String {
        let inner = inner.trim().trim_end_matches(';').trim_end();
        format!(
            "SELECT * FROM (\n{}\n) AS _arrowlens_page LIMIT {} OFFSET {}",
            inner, limit, offset
        )
    }

    /// Whether `list_tables` should return schema-qualified names. SQLite uses
    /// bare table names; server engines qualify with their schema.
    fn qualifies_table_names(&self) -> bool;

    /// Canonicalize a user-entered connection string for storage.
    fn normalize_connection_string(&self, input: &str) -> String;

    /// A sensible default connection name when the user provides none.
    fn default_connection_name(&self, connection_string: &str) -> String;

    /// Open and immediately close a connection to confirm it is reachable.
    async fn validate(&self, connection_string: &str) -> Result<()>;

    /// Run a read query and decode the rows into JSON. `limit` caps the number
    /// of rows materialized (`None` = all rows, used for streaming).
    async fn fetch(
        &self,
        registry: &DatabaseRegistry,
        connection_id: &str,
        sql: &str,
        limit: Option<usize>,
    ) -> Result<DecodedRows>;

    /// Introspect tables, columns and foreign keys for the AI schema context.
    async fn introspect_schema(
        &self,
        registry: &DatabaseRegistry,
        connection_id: &str,
    ) -> Result<SchemaIntrospection>;
}

/// Resolve the provider for a database type. This is the single registration
/// point — adding an engine means adding a variant here.
pub fn provider_for(database_type: DatabaseType) -> Box<dyn DatabaseProvider> {
    match database_type {
        DatabaseType::Sqlite => Box::new(SqliteProvider),
        DatabaseType::Postgres => Box::new(PostgresProvider),
        DatabaseType::Mysql => Box::new(MySqlProvider),
        DatabaseType::Mssql => Box::new(MssqlProvider),
    }
}

/// Stream already-decoded rows to the frontend in chunks, honoring
/// cancellation. Shared by every provider — the engine-specific work is over by
/// the time rows reach here.
pub fn emit_stream(app: &AppHandle, query_id: &str, decoded: DecodedRows, chunk_size: usize) {
    let DecodedRows { columns, rows, .. } = decoded;
    let chunk_size = chunk_size.max(1);
    let event = format!("query-chunk-{}", query_id);
    let mut chunk_index = 0usize;

    for chunk in rows.chunks(chunk_size) {
        if active_queries::is_cancelled(query_id) {
            let _ = app.emit(
                &event,
                StreamChunk {
                    query_id: query_id.to_string(),
                    chunk_index,
                    columns: columns.clone(),
                    rows: vec![],
                    row_count: 0,
                    done: true,
                },
            );
            return;
        }

        let _ = app.emit(
            &event,
            StreamChunk {
                query_id: query_id.to_string(),
                chunk_index,
                columns: columns.clone(),
                row_count: chunk.len(),
                rows: chunk.to_vec(),
                done: false,
            },
        );
        chunk_index += 1;
    }

    let _ = app.emit(
        &event,
        StreamChunk {
            query_id: query_id.to_string(),
            chunk_index,
            columns,
            rows: vec![],
            row_count: 0,
            done: true,
        },
    );
}

/// Validate a URL connection string by opening and closing a tiny pool through
/// the `any` driver. Shared by the URL-based providers (Postgres, MySQL).
pub(crate) async fn validate_via_any(connection_string: &str) -> Result<()> {
    use sqlx::any::AnyPoolOptions;
    let pool = AnyPoolOptions::new()
        .max_connections(1)
        .connect(connection_string)
        .await
        .map_err(|e| crate::error::AppError::DatabaseConnectionError(e.to_string()))?;
    pool.close().await;
    Ok(())
}

// --- Shared decoding helpers (generic over the sqlx row/column types) --------

/// Extract `(names, type_names)` from any slice of sqlx columns.
pub(crate) fn columns_of<C: Column>(cols: &[C]) -> (Vec<String>, Vec<String>) {
    let mut names = Vec::with_capacity(cols.len());
    let mut types = Vec::with_capacity(cols.len());
    for c in cols {
        names.push(c.name().to_string());
        types.push(c.type_info().name().to_string());
    }
    (names, types)
}

/// Pull rows from a sqlx result stream, stopping as soon as `limit` rows have
/// been collected (one extra is typically requested by the caller to detect
/// truncation). This is the engine-neutral half of the fetch path: by reading
/// from a stream and dropping it early we avoid buffering an entire large result
/// set in memory the way `fetch_all` does — a `SELECT *` on a huge table returns
/// quickly instead of transferring every row only to discard most of them.
pub(crate) async fn collect_capped<R, S>(mut stream: S, limit: Option<usize>) -> Result<Vec<R>>
where
    S: futures::Stream<Item = std::result::Result<R, sqlx::Error>> + Unpin,
{
    use futures::TryStreamExt;

    let started = std::time::Instant::now();
    let take = limit.unwrap_or(usize::MAX);
    let mut rows = Vec::with_capacity(take.min(4096));
    while rows.len() < take {
        match stream.try_next().await {
            Ok(Some(row)) => rows.push(row),
            Ok(None) => break,
            Err(e) => return Err(AppError::DatabaseQueryError(e.to_string())),
        }
    }
    log::info!(
        "[Query Timing] fetch+transfer {} rows in {}ms",
        rows.len(),
        started.elapsed().as_millis()
    );
    Ok(rows)
}

/// Decode fetched rows into [`DecodedRows`], using `fallback_columns` (taken
/// from the prepared statement) for the header when the result set is empty.
/// `decode_cell` is the only engine-specific piece.
pub(crate) fn decode_rows<R: Row>(
    rows: &[R],
    fallback_columns: (Vec<String>, Vec<String>),
    limit: Option<usize>,
    decode_cell: impl Fn(&R, usize) -> serde_json::Value,
) -> DecodedRows {
    let started = std::time::Instant::now();
    let (columns, column_types) = match rows.first() {
        Some(first) => columns_of(first.columns()),
        None => fallback_columns,
    };

    let take = limit.unwrap_or(usize::MAX);
    let mut out = Vec::with_capacity(rows.len().min(take));
    for row in rows.iter().take(take) {
        let mut decoded = Vec::with_capacity(columns.len());
        for idx in 0..columns.len() {
            decoded.push(decode_cell(row, idx));
        }
        out.push(decoded);
    }
    log::info!(
        "[Query Timing] decode {} rows × {} cols to JSON in {}ms",
        out.len(),
        columns.len(),
        started.elapsed().as_millis()
    );

    DecodedRows {
        columns,
        column_types,
        rows: out,
    }
}
