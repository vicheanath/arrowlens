//! SQLite provider — opened by filesystem path, introspected via PRAGMAs.

use async_trait::async_trait;
use sqlx::{Executor, Row, Statement};

use super::{
    columns_of, decode_rows, DatabaseProvider, DecodedRows, IntrospectedColumn,
    IntrospectedForeignKey, IntrospectedTable, SchemaIntrospection,
};
use crate::engine::database_registry::{
    sqlite_path, validate_sqlite_file, DatabaseRegistry, DatabaseType,
};
use crate::error::{AppError, Result};
use crate::streaming::cell_serializer::sqlite_cell_to_json;

const SCHEMA_TREE_SQL: &str = "SELECT 'main' AS schema_name, name AS table_name \
     FROM sqlite_master \
     WHERE type='table' AND name NOT LIKE 'sqlite_%' \
     ORDER BY name";

pub struct SqliteProvider;

#[async_trait]
impl DatabaseProvider for SqliteProvider {
    fn database_type(&self) -> DatabaseType {
        DatabaseType::Sqlite
    }

    fn dialect(&self) -> &'static str {
        "sqlite"
    }

    fn sql_dialect_guidance(&self) -> &'static str {
        "SQLite conventions:\n\
- Quote identifiers with double quotes: \"column name\".\n\
- String literals use single quotes: 'text'.\n\
- Pagination: LIMIT n OFFSET m.\n\
- Concatenate strings with ||.\n\
- Dynamic typing: dates/times are stored as TEXT/INTEGER/REAL — use date(), datetime(), strftime() to work with them.\n\
- No native boolean: use 1/0. LIKE is case-insensitive for ASCII only.\n\
- All tables live in the 'main' schema; reference them by bare name."
    }

    fn schema_tree_sql(&self) -> &'static str {
        SCHEMA_TREE_SQL
    }

    fn explain_sql(&self, sql: &str, _analyze: bool) -> String {
        // SQLite exposes the high-level plan via EXPLAIN QUERY PLAN; the raw
        // `EXPLAIN` (bytecode) is rarely useful, so we always use QUERY PLAN.
        format!("EXPLAIN QUERY PLAN {}", sql)
    }

    fn qualifies_table_names(&self) -> bool {
        false
    }

    fn normalize_connection_string(&self, input: &str) -> String {
        // Stored as a raw filesystem path (no URL scheme) so it opens reliably
        // on Windows paths with drive letters and backslashes.
        sqlite_path(input.trim())
    }

    fn default_connection_name(&self, connection_string: &str) -> String {
        let path = connection_string
            .strip_prefix("sqlite://")
            .unwrap_or(connection_string);
        std::path::Path::new(path)
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "sqlite_db".to_string())
    }

    async fn validate(&self, connection_string: &str) -> Result<()> {
        validate_sqlite_file(connection_string).await
    }

    async fn fetch(
        &self,
        registry: &DatabaseRegistry,
        connection_id: &str,
        sql: &str,
        limit: Option<usize>,
    ) -> Result<DecodedRows> {
        let pool = registry.get_or_create_sqlite_pool(connection_id).await?;
        let rows = super::collect_capped(sqlx::query(sql).fetch(&pool), limit).await?;

        // Column names come from the first row; only prepare for the header when
        // the result is empty.
        let fallback = if rows.is_empty() {
            let statement = pool
                .prepare(sql)
                .await
                .map_err(|e| AppError::DatabaseQueryError(e.to_string()))?;
            columns_of(statement.columns())
        } else {
            (Vec::new(), Vec::new())
        };
        Ok(decode_rows(&rows, fallback, limit, sqlite_cell_to_json))
    }

    async fn introspect_schema(
        &self,
        registry: &DatabaseRegistry,
        connection_id: &str,
    ) -> Result<SchemaIntrospection> {
        let pool = registry.get_or_create_sqlite_pool(connection_id).await?;

        let table_rows = sqlx::query(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .fetch_all(&pool)
        .await
        .map_err(|e| AppError::DatabaseQueryError(e.to_string()))?;

        let table_names: Vec<String> = table_rows
            .iter()
            .filter_map(|r| r.try_get::<String, _>(0).ok())
            .collect();

        let mut tables = Vec::new();
        let mut foreign_keys = Vec::new();

        for name in table_names {
            let escaped = name.replace('"', "\"\"");

            // A virtual table backed by an unavailable module (e.g. a custom
            // `USING SomeModule(...)`) fails here with "no such module". Skip it
            // so one unreadable table doesn't break introspection of the rest of
            // the database.
            let info_rows =
                match sqlx::query(&format!("PRAGMA table_info(\"{}\")", escaped))
                    .fetch_all(&pool)
                    .await
                {
                    Ok(rows) => rows,
                    Err(_) => continue,
                };

            let mut columns = Vec::new();
            for row in &info_rows {
                let col_name: String = row.try_get("name").unwrap_or_default();
                let data_type: String = row.try_get("type").unwrap_or_default();
                let notnull: i64 = row.try_get("notnull").unwrap_or(0);
                let pk: i64 = row.try_get("pk").unwrap_or(0);
                columns.push(IntrospectedColumn {
                    name: col_name,
                    data_type: if data_type.is_empty() {
                        "TEXT".to_string()
                    } else {
                        data_type
                    },
                    nullable: notnull == 0,
                    is_primary_key: pk > 0,
                });
            }

            // Foreign keys are best-effort — never fail introspection over them.
            if let Ok(fk_rows) = sqlx::query(&format!("PRAGMA foreign_key_list(\"{}\")", escaped))
                .fetch_all(&pool)
                .await
            {
                for row in &fk_rows {
                    foreign_keys.push(IntrospectedForeignKey {
                        from_table: name.clone(),
                        from_column: row.try_get("from").unwrap_or_default(),
                        to_table: row.try_get("table").unwrap_or_default(),
                        to_column: row.try_get("to").unwrap_or_default(),
                    });
                }
            }

            tables.push(IntrospectedTable {
                schema: "main".to_string(),
                name: name.clone(),
                qualified_name: name,
                columns,
                row_estimate: None,
            });
        }

        Ok(SchemaIntrospection {
            tables,
            foreign_keys,
        })
    }
}
