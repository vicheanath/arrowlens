//! MySQL provider — runs over the shared `any` driver pool.

use async_trait::async_trait;
use sqlx::{Executor, Row, Statement};

use super::{
    columns_of, decode_rows, DatabaseProvider, DecodedRows, IntrospectedColumn,
    IntrospectedForeignKey, IntrospectedTable, SchemaIntrospection,
};
use crate::engine::database_registry::{DatabaseRegistry, DatabaseType};
use crate::error::{AppError, Result};
use crate::streaming::cell_serializer::any_cell_to_json;

const SCHEMA_TREE_SQL: &str = "SELECT table_schema AS schema_name, table_name \
     FROM information_schema.tables \
     WHERE table_schema = DATABASE() \
         AND table_type IN ('BASE TABLE', 'VIEW') \
     ORDER BY table_schema, table_name";

pub struct MySqlProvider;

#[async_trait]
impl DatabaseProvider for MySqlProvider {
    fn database_type(&self) -> DatabaseType {
        DatabaseType::Mysql
    }

    fn dialect(&self) -> &'static str {
        "mysql"
    }

    fn sql_dialect_guidance(&self) -> &'static str {
        "MySQL conventions:\n\
- Quote identifiers with backticks: `column name`.\n\
- String literals use single quotes: 'text'.\n\
- Pagination: LIMIT n OFFSET m (or LIMIT offset, count).\n\
- Concatenate strings with CONCAT(a, b, c) — the || operator is logical OR, not concatenation.\n\
- LIKE is case-insensitive under the default collation.\n\
- Boolean is TINYINT(1); TRUE/FALSE are accepted aliases for 1/0.\n\
- Current time: NOW(), CURDATE(). Cast with CAST(value AS type)."
    }

    fn schema_tree_sql(&self) -> &'static str {
        SCHEMA_TREE_SQL
    }

    fn explain_sql(&self, sql: &str, analyze: bool) -> String {
        // EXPLAIN ANALYZE requires MySQL 8.0.18+; plain EXPLAIN is universal.
        if analyze {
            format!("EXPLAIN ANALYZE {}", sql)
        } else {
            format!("EXPLAIN {}", sql)
        }
    }

    fn qualifies_table_names(&self) -> bool {
        true
    }

    fn normalize_connection_string(&self, input: &str) -> String {
        input.trim().to_string()
    }

    fn default_connection_name(&self, _connection_string: &str) -> String {
        "mysql_db".to_string()
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
        let pool = registry.get_or_create_pool(connection_id).await?;
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
        Ok(decode_rows(&rows, fallback, limit, any_cell_to_json))
    }

    async fn introspect_schema(
        &self,
        registry: &DatabaseRegistry,
        connection_id: &str,
    ) -> Result<SchemaIntrospection> {
        let pool = registry.get_or_create_pool(connection_id).await?;

        let column_sql = "\
            SELECT table_name, column_name, data_type, is_nullable, column_key \
            FROM information_schema.columns \
            WHERE table_schema = DATABASE() \
            ORDER BY table_name, ordinal_position";
        let rows = sqlx::query(column_sql)
            .fetch_all(&pool)
            .await
            .map_err(|e| AppError::DatabaseQueryError(e.to_string()))?;

        let mut tables: Vec<IntrospectedTable> = Vec::new();
        for row in &rows {
            let table: String = row.try_get(0).unwrap_or_default();
            let column: String = row.try_get(1).unwrap_or_default();
            let data_type: String = row.try_get(2).unwrap_or_default();
            let is_nullable: String = row.try_get(3).unwrap_or_else(|_| "YES".to_string());
            let column_key: String = row.try_get(4).unwrap_or_default();

            let entry = match tables.iter_mut().find(|t| t.name == table) {
                Some(t) => t,
                None => {
                    tables.push(IntrospectedTable {
                        schema: String::new(),
                        name: table.clone(),
                        qualified_name: table.clone(),
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
                is_primary_key: column_key == "PRI",
            });
        }

        let fk_sql = "\
            SELECT table_name, column_name, referenced_table_name, referenced_column_name \
            FROM information_schema.key_column_usage \
            WHERE table_schema = DATABASE() AND referenced_table_name IS NOT NULL";
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

        Ok(SchemaIntrospection {
            tables,
            foreign_keys,
        })
    }
}
