//! Microsoft SQL Server provider — runs over tiberius (TDS), pooled with bb8.
//!
//! Unlike the other engines, SQL Server does not go through sqlx (sqlx dropped
//! MSSQL in 0.7+), so this provider owns its decoding path: it pulls tiberius
//! rows off the query stream and turns them into [`DecodedRows`] directly,
//! reusing none of the sqlx-generic helpers.

use async_trait::async_trait;
use futures::TryStreamExt;

use super::{
    DatabaseProvider, DecodedRows, IntrospectedColumn, IntrospectedForeignKey, IntrospectedTable,
    SchemaIntrospection,
};
use crate::engine::database_registry::{mssql_config, DatabaseRegistry, DatabaseType};
use crate::error::{AppError, Result};
use crate::streaming::cell_serializer::mssql_cell_to_json;

/// Tables + views in the connected database, excluding the system schemas.
const SCHEMA_TREE_SQL: &str = "SELECT TABLE_SCHEMA AS schema_name, TABLE_NAME AS table_name \
     FROM INFORMATION_SCHEMA.TABLES \
     WHERE TABLE_SCHEMA NOT IN ('sys', 'INFORMATION_SCHEMA') \
     ORDER BY TABLE_SCHEMA, TABLE_NAME";

/// Private marker prefix that [`MssqlProvider::explain_sql`] stamps onto a query
/// so [`MssqlProvider::fetch`] knows to run the SHOWPLAN_XML sequence instead of
/// the query itself. `SET SHOWPLAN_XML ON` must be alone in its batch, so the
/// plan can't be requested with an inline prefix the way other engines do.
const SHOWPLAN_MARKER: &str = "--arrowlens:showplan\n";

pub struct MssqlProvider;

#[async_trait]
impl DatabaseProvider for MssqlProvider {
    fn database_type(&self) -> DatabaseType {
        DatabaseType::Mssql
    }

    fn dialect(&self) -> &'static str {
        "mssql"
    }

    fn sql_dialect_guidance(&self) -> &'static str {
        "SQL Server (T-SQL) conventions:\n\
- Quote identifiers with square brackets: [column name]. Double quotes also work when QUOTED_IDENTIFIER is ON.\n\
- String literals use single quotes: 'text'; prefix Unicode literals with N: N'text'.\n\
- Row limiting: SELECT TOP (n) ... , or ORDER BY ... OFFSET m ROWS FETCH NEXT n ROWS ONLY (OFFSET/FETCH requires ORDER BY).\n\
- There is no LIMIT keyword.\n\
- Concatenate strings with + or CONCAT(a, b, c). Use ISNULL(x, y) or COALESCE for null handling.\n\
- String length is LEN(); substring is SUBSTRING(s, start, length).\n\
- Current time: GETDATE(), SYSDATETIME(). Cast with CAST(value AS type) or CONVERT(type, value).\n\
- Boolean is BIT (1/0); there is no native TRUE/FALSE literal."
    }

    fn schema_tree_sql(&self) -> &'static str {
        SCHEMA_TREE_SQL
    }

    fn explain_sql(&self, sql: &str, _analyze: bool) -> String {
        // Estimated plan via SHOWPLAN_XML (no execution), matching the other
        // engines' non-executing EXPLAIN. The marker routes this through the
        // SET-on / run / SET-off sequence in `fetch` (see SHOWPLAN_MARKER).
        format!("{}{}", SHOWPLAN_MARKER, sql)
    }

    fn page_wrap(&self, inner: &str, offset: usize, limit: usize) -> String {
        // SQL Server has no LIMIT/OFFSET; it uses OFFSET..ROWS FETCH NEXT, which
        // requires an ORDER BY — `(SELECT NULL)` is a stable no-op ordering.
        let inner = inner.trim().trim_end_matches(';').trim_end();
        format!(
            "SELECT * FROM (\n{}\n) AS _arrowlens_page ORDER BY (SELECT NULL) OFFSET {} ROWS FETCH NEXT {} ROWS ONLY",
            inner, offset, limit
        )
    }

    fn qualifies_table_names(&self) -> bool {
        true
    }

    fn normalize_connection_string(&self, input: &str) -> String {
        input.trim().to_string()
    }

    fn default_connection_name(&self, connection_string: &str) -> String {
        connection_string
            .split(';')
            .find_map(|kv| {
                let mut it = kv.splitn(2, '=');
                let key = it.next()?.trim();
                let value = it.next()?.trim();
                if key.eq_ignore_ascii_case("database")
                    || key.eq_ignore_ascii_case("initial catalog")
                {
                    Some(value.to_string())
                } else {
                    None
                }
            })
            .filter(|name| !name.is_empty())
            .unwrap_or_else(|| "sqlserver_db".to_string())
    }

    async fn validate(&self, connection_string: &str) -> Result<()> {
        let config = mssql_config(connection_string)?;
        let manager = bb8_tiberius::ConnectionManager::new(config);
        let pool = bb8::Pool::builder()
            .max_size(1)
            .build(manager)
            .await
            .map_err(|e| AppError::DatabaseConnectionError(e.to_string()))?;
        let mut client = pool
            .get()
            .await
            .map_err(|e| AppError::DatabaseConnectionError(e.to_string()))?;
        client
            .simple_query("SELECT 1")
            .await
            .map_err(|e| AppError::DatabaseConnectionError(e.to_string()))?
            .into_first_result()
            .await
            .map_err(|e| AppError::DatabaseConnectionError(e.to_string()))?;
        Ok(())
    }

    async fn fetch(
        &self,
        registry: &DatabaseRegistry,
        connection_id: &str,
        sql: &str,
        limit: Option<usize>,
    ) -> Result<DecodedRows> {
        let pool = registry.get_or_create_mssql_pool(connection_id).await?;
        let mut client = pool
            .get()
            .await
            .map_err(|e| AppError::DatabaseConnectionError(e.to_string()))?;

        // EXPLAIN: run the SHOWPLAN_XML on/query/off sequence on this connection.
        if let Some(inner) = sql.strip_prefix(SHOWPLAN_MARKER) {
            return run_showplan(&mut client, inner).await;
        }

        let take = limit.unwrap_or(usize::MAX);
        let mut columns: Vec<String> = Vec::new();
        let mut column_types: Vec<String> = Vec::new();
        let mut rows: Vec<tiberius::Row> = Vec::new();

        let mut stream = client
            .simple_query(sql)
            .await
            .map_err(|e| AppError::DatabaseQueryError(e.to_string()))?;

        // Drain the whole stream (keeps the pooled connection reusable) but only
        // retain up to `take` rows so a huge result set never balloons memory.
        while let Some(item) = stream
            .try_next()
            .await
            .map_err(|e| AppError::DatabaseQueryError(e.to_string()))?
        {
            match item {
                tiberius::QueryItem::Metadata(meta) => {
                    if columns.is_empty() {
                        for col in meta.columns() {
                            columns.push(col.name().to_string());
                            column_types.push(format!("{:?}", col.column_type()));
                        }
                    }
                }
                tiberius::QueryItem::Row(row) => {
                    if rows.len() < take {
                        rows.push(row);
                    }
                }
            }
        }
        drop(stream);

        // Empty result with no metadata emitted — fall back to the first row's
        // column descriptors (there are none here, so this just stays empty).
        if columns.is_empty() {
            if let Some(first) = rows.first() {
                for col in first.columns() {
                    columns.push(col.name().to_string());
                    column_types.push(format!("{:?}", col.column_type()));
                }
            }
        }

        let decoded: Vec<Vec<serde_json::Value>> = rows
            .iter()
            .map(|row| {
                (0..columns.len())
                    .map(|idx| mssql_cell_to_json(row, idx))
                    .collect()
            })
            .collect();

        Ok(DecodedRows {
            columns,
            column_types,
            rows: decoded,
        })
    }

    async fn introspect_schema(
        &self,
        registry: &DatabaseRegistry,
        connection_id: &str,
    ) -> Result<SchemaIntrospection> {
        let pool = registry.get_or_create_mssql_pool(connection_id).await?;
        let mut client = pool
            .get()
            .await
            .map_err(|e| AppError::DatabaseConnectionError(e.to_string()))?;

        let column_sql = "\
            SELECT c.TABLE_SCHEMA, c.TABLE_NAME, c.COLUMN_NAME, c.DATA_TYPE, c.IS_NULLABLE, \
                   CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 'YES' ELSE 'NO' END AS IS_PK \
            FROM INFORMATION_SCHEMA.COLUMNS c \
            LEFT JOIN ( \
                SELECT kcu.TABLE_SCHEMA, kcu.TABLE_NAME, kcu.COLUMN_NAME \
                FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc \
                JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu \
                  ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA \
                WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' \
            ) pk ON pk.TABLE_SCHEMA = c.TABLE_SCHEMA AND pk.TABLE_NAME = c.TABLE_NAME \
                AND pk.COLUMN_NAME = c.COLUMN_NAME \
            WHERE c.TABLE_SCHEMA NOT IN ('sys', 'INFORMATION_SCHEMA') \
            ORDER BY c.TABLE_SCHEMA, c.TABLE_NAME, c.ORDINAL_POSITION";

        let column_rows = client
            .simple_query(column_sql)
            .await
            .map_err(|e| AppError::DatabaseQueryError(e.to_string()))?
            .into_first_result()
            .await
            .map_err(|e| AppError::DatabaseQueryError(e.to_string()))?;

        let mut tables: Vec<IntrospectedTable> = Vec::new();
        for row in &column_rows {
            let schema = get_str(row, 0);
            let table = get_str(row, 1);
            let column = get_str(row, 2);
            let data_type = get_str(row, 3);
            let is_nullable = get_str(row, 4);
            let is_pk = get_str(row, 5);
            let qualified = format!("{}.{}", schema, table);

            let entry = match tables
                .iter_mut()
                .find(|t| t.schema == schema && t.name == table)
            {
                Some(t) => t,
                None => {
                    tables.push(IntrospectedTable {
                        schema: schema.clone(),
                        name: table.clone(),
                        qualified_name: qualified,
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
            SELECT fk.TABLE_SCHEMA + '.' + fk.TABLE_NAME AS from_table, fk.COLUMN_NAME AS from_column, \
                   pk.TABLE_SCHEMA + '.' + pk.TABLE_NAME AS to_table, pk.COLUMN_NAME AS to_column \
            FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc \
            JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE fk ON rc.CONSTRAINT_NAME = fk.CONSTRAINT_NAME \
            JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE pk ON rc.UNIQUE_CONSTRAINT_NAME = pk.CONSTRAINT_NAME \
                AND fk.ORDINAL_POSITION = pk.ORDINAL_POSITION";

        let fk_rows = client
            .simple_query(fk_sql)
            .await
            .map_err(|e| AppError::DatabaseQueryError(e.to_string()))?
            .into_first_result()
            .await
            .map_err(|e| AppError::DatabaseQueryError(e.to_string()))?;

        let foreign_keys = fk_rows
            .iter()
            .map(|row| IntrospectedForeignKey {
                from_table: get_str(row, 0),
                from_column: get_str(row, 1),
                to_table: get_str(row, 2),
                to_column: get_str(row, 3),
            })
            .collect();

        Ok(SchemaIntrospection {
            tables,
            foreign_keys,
        })
    }
}

/// Read a string column from an introspection row, defaulting to empty.
fn get_str(row: &tiberius::Row, idx: usize) -> String {
    row.try_get::<&str, _>(idx)
        .ok()
        .flatten()
        .unwrap_or_default()
        .to_string()
}

/// Run `SET SHOWPLAN_XML ON` → query → `SET SHOWPLAN_XML OFF` on one connection,
/// returning the estimated execution plan (XML) as a single cell.
async fn run_showplan(
    client: &mut bb8::PooledConnection<'_, bb8_tiberius::ConnectionManager>,
    inner: &str,
) -> Result<DecodedRows> {
    let query_err = |e: tiberius::error::Error| AppError::DatabaseQueryError(e.to_string());

    client
        .simple_query("SET SHOWPLAN_XML ON")
        .await
        .map_err(query_err)?
        .into_results()
        .await
        .map_err(query_err)?;

    // With SHOWPLAN_XML ON the query is NOT executed; it returns one XML row.
    let plan_rows = client.simple_query(inner).await.map_err(query_err)?;
    let plan_rows = plan_rows.into_first_result().await.map_err(query_err)?;

    // Always turn SHOWPLAN back off before the connection returns to the pool.
    client
        .simple_query("SET SHOWPLAN_XML OFF")
        .await
        .map_err(query_err)?
        .into_results()
        .await
        .map_err(query_err)?;

    let (columns, column_types) = match plan_rows.first() {
        Some(row) => (
            row.columns().iter().map(|c| c.name().to_string()).collect(),
            row.columns()
                .iter()
                .map(|c| format!("{:?}", c.column_type()))
                .collect(),
        ),
        None => (vec!["Query Plan".to_string()], vec!["Xml".to_string()]),
    };

    let rows: Vec<Vec<serde_json::Value>> = plan_rows
        .iter()
        .map(|row| {
            (0..row.columns().len())
                .map(|idx| mssql_cell_to_json(row, idx))
                .collect()
        })
        .collect();

    Ok(DecodedRows {
        columns,
        column_types,
        rows,
    })
}
