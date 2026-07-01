use serde::Serialize;
use sqlparser::ast::Statement;
use sqlparser::dialect::{
    Dialect, GenericDialect, MsSqlDialect, MySqlDialect, PostgreSqlDialect, SQLiteDialect,
};
use sqlparser::parser::Parser;

use crate::engine::database_registry::DatabaseType;

/// Outcome of statically validating a generated SQL statement.
#[derive(Debug, Clone, Serialize)]
pub struct ValidationReport {
    /// Parsed cleanly under the target dialect.
    pub parsed: bool,
    /// Contains only read-only statements (SELECT / WITH).
    pub read_only: bool,
    pub statement_count: usize,
    /// Human-readable problem description when `parsed` or `read_only` is false.
    pub message: Option<String>,
}

impl ValidationReport {
    pub fn is_safe(&self) -> bool {
        self.parsed && self.read_only && self.statement_count > 0
    }
}

fn dialect_for(database_type: Option<DatabaseType>) -> Box<dyn Dialect> {
    match database_type {
        Some(DatabaseType::Postgres) => Box::new(PostgreSqlDialect {}),
        Some(DatabaseType::Mysql) => Box::new(MySqlDialect {}),
        Some(DatabaseType::Sqlite) => Box::new(SQLiteDialect {}),
        Some(DatabaseType::Mssql) => Box::new(MsSqlDialect {}),
        None => Box::new(GenericDialect {}),
    }
}

/// Parse `sql` and verify it is a single (or set of) read-only statement(s).
pub fn validate_read_only_sql(sql: &str, database_type: Option<DatabaseType>) -> ValidationReport {
    let dialect = dialect_for(database_type);
    match Parser::parse_sql(dialect.as_ref(), sql) {
        Ok(statements) => {
            let count = statements.len();
            if count == 0 {
                return ValidationReport {
                    parsed: true,
                    read_only: false,
                    statement_count: 0,
                    message: Some("No SQL statement was produced.".to_string()),
                };
            }
            let offending = statements.iter().find(|s| !is_read_only(s));
            match offending {
                Some(stmt) => ValidationReport {
                    parsed: true,
                    read_only: false,
                    statement_count: count,
                    message: Some(format!(
                        "Only read-only SELECT queries are allowed; found a write/DDL statement: {}",
                        statement_kind(stmt)
                    )),
                },

                None => ValidationReport {
                    parsed: true,
                    read_only: true,
                    statement_count: count,
                    message: None,
                },
            }
        }
        Err(e) => ValidationReport {
            parsed: false,
            read_only: false,
            statement_count: 0,
            message: Some(format!("SQL did not parse: {e}")),
        },
    }
}

fn is_read_only(stmt: &Statement) -> bool {
    matches!(stmt, Statement::Query(_) | Statement::Explain { .. })
}

/// A short, version-agnostic label for a statement (first SQL keyword). Avoids
/// matching individual `Statement` variants, whose shapes differ across
/// sqlparser releases.
fn statement_kind(stmt: &Statement) -> String {
    stmt.to_string()
        .split_whitespace()
        .next()
        .unwrap_or("statement")
        .to_uppercase()
}

/// Extract a SQL statement from an LLM response, stripping Markdown code fences
/// and any prose before/after the fenced block.
pub fn extract_sql(response: &str) -> String {
    let trimmed = response.trim();
    if let Some(start) = trimmed.find("```") {
        let after = &trimmed[start + 3..];
        // Skip an optional language tag on the same line (e.g. ```sql).
        let body_start = after.find('\n').map(|i| i + 1).unwrap_or(0);
        let body = &after[body_start..];
        if let Some(end) = body.find("```") {
            return body[..end].trim().to_string();
        }
        return body.trim().to_string();
    }
    trimmed.to_string()
}
