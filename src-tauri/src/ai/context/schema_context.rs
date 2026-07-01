use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

use serde::Serialize;

use crate::engine::database_registry::{DatabaseRegistry, DatabaseType};
use crate::engine::provider::provider_for;
use crate::error::{AppError, Result};

#[derive(Debug, Clone, Serialize)]
pub struct ColumnContext {
    pub name: String,
    pub data_type: String,
    pub nullable: bool,
    pub is_primary_key: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ForeignKeyRef {
    pub from_table: String,
    pub from_column: String,
    pub to_table: String,
    pub to_column: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct TableContext {
    pub schema: String,
    pub name: String,
    pub qualified_name: String,
    pub columns: Vec<ColumnContext>,
    pub row_estimate: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SchemaContext {
    pub dialect: String,
    pub tables: Vec<TableContext>,
    pub foreign_keys: Vec<ForeignKeyRef>,
    pub hash: String,
    /// True when the table list was capped by `max_tables`.
    pub truncated: bool,
}

impl SchemaContext {
    /// The dialect string used for prompts and the SQL parser.
    pub fn dialect_label(database_type: DatabaseType) -> &'static str {
        match database_type {
            DatabaseType::Sqlite => "sqlite",
            DatabaseType::Mysql => "mysql",
            DatabaseType::Postgres => "postgres",
            DatabaseType::Mssql => "mssql",
        }
    }

    /// Render the schema as a compact DDL-like block. LLMs ground far better on
    /// `CREATE TABLE` than on JSON.
    pub fn to_ddl(&self) -> String {
        let mut out = String::new();
        out.push_str(&format!("-- dialect: {}\n", self.dialect));
        if self.truncated {
            out.push_str("-- note: table list truncated to fit the context budget\n");
        }
        for table in &self.tables {
            out.push_str(&format!("CREATE TABLE {} (\n", table.qualified_name));
            let mut col_lines: Vec<String> = Vec::new();
            for col in &table.columns {
                let mut line = format!("  {} {}", col.name, col.data_type);
                if col.is_primary_key {
                    line.push_str(" PRIMARY KEY");
                }
                if !col.nullable {
                    line.push_str(" NOT NULL");
                }
                // Annotate FK targets inline for join inference.
                if let Some(fk) = self
                    .foreign_keys
                    .iter()
                    .find(|f| f.from_table == table.name && f.from_column == col.name)
                {
                    line.push_str(&format!("  -- FK -> {}.{}", fk.to_table, fk.to_column));
                }
                col_lines.push(line);
            }
            out.push_str(&col_lines.join(",\n"));
            out.push_str("\n)");
            if let Some(rows) = table.row_estimate {
                out.push_str(&format!(";  -- ~{} rows\n", rows));
            } else {
                out.push_str(";\n");
            }
        }
        out
    }

    /// Recompute `hash` from the current `to_ddl()` output. Callers that mutate
    /// `tables` after construction (e.g. filtering to a relevance-selected
    /// subset) must call this so `hash` stays consistent with the rendered DDL.
    pub fn recompute_hash(&mut self) {
        self.hash = compute_hash(&self.to_ddl());
    }
}

fn compute_hash(ddl: &str) -> String {
    let mut hasher = DefaultHasher::new();
    ddl.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

/// Build a schema context for an external database connection.
///
/// `table_filter` optionally restricts the context to a single (possibly
/// schema-qualified) table; `max_tables` caps how many tables are included.
pub async fn build_schema_context(
    registry: &DatabaseRegistry,
    connection_id: &str,
    table_filter: Option<&str>,
    max_tables: usize,
) -> Result<SchemaContext> {
    let info = registry.get(connection_id).ok_or(AppError::DatabaseNotFound)?;
    let provider = provider_for(info.database_type);
    let dialect = provider.dialect().to_string();

    let introspection = provider.introspect_schema(registry, connection_id).await?;
    let mut tables: Vec<TableContext> = introspection
        .tables
        .into_iter()
        .map(|t| TableContext {
            schema: t.schema,
            name: t.name,
            qualified_name: t.qualified_name,
            columns: t
                .columns
                .into_iter()
                .map(|c| ColumnContext {
                    name: c.name,
                    data_type: c.data_type,
                    nullable: c.nullable,
                    is_primary_key: c.is_primary_key,
                })
                .collect(),
            row_estimate: t.row_estimate,
        })
        .collect();
    let foreign_keys: Vec<ForeignKeyRef> = introspection
        .foreign_keys
        .into_iter()
        .map(|f| ForeignKeyRef {
            from_table: f.from_table,
            from_column: f.from_column,
            to_table: f.to_table,
            to_column: f.to_column,
        })
        .collect();

    // Optional single-table focus (matches by bare or qualified name).
    if let Some(filter) = table_filter {
        let needle = filter.to_lowercase();
        tables.retain(|t| {
            t.name.to_lowercase() == needle || t.qualified_name.to_lowercase() == needle
        });
    }

    tables.sort_by(|a, b| a.qualified_name.cmp(&b.qualified_name));
    let truncated = tables.len() > max_tables;
    if truncated {
        tables.truncate(max_tables);
    }

    let mut ctx = SchemaContext {
        dialect,
        tables,
        foreign_keys,
        hash: String::new(),
        truncated,
    };
    ctx.hash = compute_hash(&ctx.to_ddl());
    Ok(ctx)
}

/// Build a schema context restricted to a relevance-selected set of tables
/// (from knowledge-base retrieval) instead of the naive alphabetical-first-N
/// truncation `build_schema_context` falls back to. Reuses the same
/// introspection and DDL rendering; only the table selection differs.
pub async fn build_focused_schema_context(
    registry: &DatabaseRegistry,
    connection_id: &str,
    table_allowlist: &[String],
    max_tables: usize,
) -> Result<SchemaContext> {
    let mut ctx = build_schema_context(registry, connection_id, None, usize::MAX).await?;
    let allowed: std::collections::HashSet<&str> =
        table_allowlist.iter().map(|s| s.as_str()).collect();
    ctx.tables.retain(|t| allowed.contains(t.qualified_name.as_str()));
    if ctx.tables.len() > max_tables {
        ctx.tables.truncate(max_tables);
    }
    // This is a relevance-focused selection, not a naive cutoff — don't carry
    // over the "table list truncated" DDL note that `build_schema_context`
    // would otherwise add for a shrunken table list.
    ctx.truncated = false;
    ctx.recompute_hash();
    Ok(ctx)
}
