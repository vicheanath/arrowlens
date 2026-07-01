//! PostgreSQL provider — typed pool, `information_schema` introspection.

use async_trait::async_trait;
use sqlx::{Executor, Row, Statement};

use super::{
    columns_of, decode_rows, DatabaseProvider, DecodedRows, IntrospectedColumn,
    IntrospectedForeignKey, IntrospectedTable, SchemaIntrospection,
};
use crate::engine::database_registry::{DatabaseRegistry, DatabaseType};
use crate::error::{AppError, Result};
use crate::streaming::cell_serializer::pg_cell_to_json;

const SCHEMA_TREE_SQL: &str =
    "SELECT table_schema::text AS schema_name, table_name::text AS table_name \
     FROM information_schema.tables \
     WHERE table_schema NOT IN ('pg_catalog', 'information_schema') \
         AND table_type IN ('BASE TABLE', 'VIEW', 'FOREIGN') \
     ORDER BY table_schema, table_name";

pub struct PostgresProvider;

#[async_trait]
impl DatabaseProvider for PostgresProvider {
    fn database_type(&self) -> DatabaseType {
        DatabaseType::Postgres
    }

    fn dialect(&self) -> &'static str {
        "postgres"
    }

    fn sql_dialect_guidance(&self) -> &'static str {
        "PostgreSQL conventions:\n\
- Quote identifiers with double quotes: \"column name\". Unquoted identifiers fold to lowercase, so quote any that are mixed-case or reserved.\n\
- String literals use single quotes: 'text'. Escape an embedded quote by doubling it ('it''s').\n\
- Pagination: LIMIT n OFFSET m.\n\
- Case-insensitive matching: ILIKE. Cast with value::type or CAST(value AS type).\n\
- Concatenate strings with || (e.g. first || ' ' || last).\n\
- Real boolean type: use TRUE/FALSE. Current time: NOW(), CURRENT_DATE.\n\
- Schema-qualify tables outside the public schema (e.g. analytics.events)."
    }

    fn schema_tree_sql(&self) -> &'static str {
        SCHEMA_TREE_SQL
    }

    fn explain_sql(&self, sql: &str, analyze: bool) -> String {
        if analyze {
            format!("EXPLAIN (ANALYZE, VERBOSE, BUFFERS, FORMAT TEXT) {}", sql)
        } else {
            format!("EXPLAIN (VERBOSE, FORMAT TEXT) {}", sql)
        }
    }

    fn qualifies_table_names(&self) -> bool {
        true
    }

    fn normalize_connection_string(&self, input: &str) -> String {
        input.trim().to_string()
    }

    fn default_connection_name(&self, _connection_string: &str) -> String {
        "postgres_db".to_string()
    }

    async fn validate(&self, connection_string: &str) -> Result<()> {
        super::validate_via_any(connection_string).await
    }

    async fn fetch(
        &self,
        registry: &DatabaseRegistry,
        connection_id: &str,
        sql: &str,
        limit: Option<usize>,
    ) -> Result<DecodedRows> {
        let pool = registry.get_or_create_pg_pool(connection_id).await?;
        let rows = super::collect_capped(sqlx::query(sql).fetch(&pool), limit).await?;

        // Column names come from the first row. Only when the result is empty do
        // we pay an extra `prepare` round-trip to recover the header.
        let fallback = if rows.is_empty() {
            let statement = pool
                .prepare(sql)
                .await
                .map_err(|e| AppError::DatabaseQueryError(e.to_string()))?;
            columns_of(statement.columns())
        } else {
            (Vec::new(), Vec::new())
        };
        Ok(decode_rows(&rows, fallback, limit, pg_cell_to_json))
    }

    async fn introspect_schema(
        &self,
        registry: &DatabaseRegistry,
        connection_id: &str,
    ) -> Result<SchemaIntrospection> {
        let pool = registry.get_or_create_pg_pool(connection_id).await?;

        let column_sql = "\
            SELECT c.table_schema::text, c.table_name::text, c.column_name::text, c.data_type::text, \
                   c.is_nullable::text, \
                   CASE WHEN pk.column_name IS NOT NULL THEN 'YES' ELSE 'NO' END::text AS is_pk \
            FROM information_schema.columns c \
            LEFT JOIN ( \
                SELECT kcu.table_schema, kcu.table_name, kcu.column_name \
                FROM information_schema.table_constraints tc \
                JOIN information_schema.key_column_usage kcu \
                  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema \
                WHERE tc.constraint_type = 'PRIMARY KEY' \
            ) pk ON pk.table_schema = c.table_schema AND pk.table_name = c.table_name AND pk.column_name = c.column_name \
            WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema') \
            ORDER BY c.table_schema, c.table_name, c.ordinal_position";

        let rows = sqlx::query(column_sql)
            .fetch_all(&pool)
            .await
            .map_err(|e| AppError::DatabaseQueryError(e.to_string()))?;

        let mut tables: Vec<IntrospectedTable> = Vec::new();
        for row in &rows {
            let schema: String = row.try_get(0).unwrap_or_default();
            let table: String = row.try_get(1).unwrap_or_default();
            let column: String = row.try_get(2).unwrap_or_default();
            let data_type: String = row.try_get(3).unwrap_or_default();
            let is_nullable: String = row.try_get(4).unwrap_or_else(|_| "YES".to_string());
            let is_pk: String = row.try_get(5).unwrap_or_else(|_| "NO".to_string());

            let qualified = if schema == "public" {
                table.clone()
            } else {
                format!("{}.{}", schema, table)
            };
            let entry = match tables.iter_mut().find(|t| t.qualified_name == qualified) {
                Some(t) => t,
                None => {
                    tables.push(IntrospectedTable {
                        schema: schema.clone(),
                        name: table.clone(),
                        qualified_name: qualified.clone(),
                        columns: Vec::new(),
                        row_estimate: None,
                    });
                    tables.last_mut().unwrap()
                }
            };
            entry.columns.push(IntrospectedColumn {
                name: column,
                data_type,
                nullable: is_nullable.eq_ignore_ascii_case("YES"),
                is_primary_key: is_pk == "YES",
            });
        }

        let fk_sql = "\
            SELECT tc.table_name::text, kcu.column_name::text, ccu.table_name::text, ccu.column_name::text \
            FROM information_schema.table_constraints tc \
            JOIN information_schema.key_column_usage kcu \
              ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema \
            JOIN information_schema.constraint_column_usage ccu \
              ON ccu.constraint_name = tc.constraint_name \
            WHERE tc.constraint_type = 'FOREIGN KEY' \
              AND tc.table_schema NOT IN ('pg_catalog', 'information_schema')";
        let fk_rows = sqlx::query(fk_sql)
            .fetch_all(&pool)
            .await
            .map_err(|e| AppError::DatabaseQueryError(e.to_string()))?;
        let foreign_keys = fk_rows
            .iter()
            .map(|row| IntrospectedForeignKey {
                from_table: row.try_get(0).unwrap_or_default(),
                from_column: row.try_get(1).unwrap_or_default(),
                to_table: row.try_get(2).unwrap_or_default(),
                to_column: row.try_get(3).unwrap_or_default(),
            })
            .collect();

        // Best-effort row estimates from planner statistics.
        if let Ok(est_rows) = sqlx::query(
            "SELECT n.nspname::text, c.relname::text, c.reltuples::bigint \
             FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace \
             WHERE c.relkind = 'r' AND n.nspname NOT IN ('pg_catalog', 'information_schema')",
        )
        .fetch_all(&pool)
        .await
        {
            for row in &est_rows {
                let schema: String = row.try_get(0).unwrap_or_default();
                let relname: String = row.try_get(1).unwrap_or_default();
                let est: i64 = row.try_get(2).unwrap_or(0);
                let qualified = if schema == "public" {
                    relname.clone()
                } else {
                    format!("{}.{}", schema, relname)
                };
                if let Some(t) = tables.iter_mut().find(|t| t.qualified_name == qualified) {
                    if est >= 0 {
                        t.row_estimate = Some(est);
                    }
                }
            }
        }

        Ok(SchemaIntrospection {
            tables,
            foreign_keys,
        })
    }
}
