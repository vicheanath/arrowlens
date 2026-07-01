//! Data profiling: sample a bounded number of rows per table (via the existing
//! paginated fetch path — one query per table, not one per column) and compute
//! per-column statistics in Rust. Works identically across every SQL dialect
//! since nothing dialect-specific is needed beyond the `SELECT * FROM table`
//! itself and the existing `page_wrap`/`fetch` machinery each provider already
//! implements for the results grid.

use std::collections::HashMap;
use std::sync::Arc;

use serde_json::Value;

use crate::ai::context::knowledge_store::{ColumnProfile, TableProfile};
use crate::ai::context::schema_context::TableContext;
use crate::api::query_api::quote_identifier;
use crate::engine::database_executor::DatabaseExecutor;
use crate::engine::database_registry::{DatabaseRegistry, DatabaseType};
use crate::engine::query_executor::QueryExecutor;
use crate::error::Result;

/// A column is only reported as "categorical" (with `top_values` populated)
/// when its sampled distinct-value count is at or below this cap — otherwise
/// it's almost certainly an id/free-text column where a top-K list is noise.
const TOP_VALUES_CARDINALITY_CAP: usize = 50;
const TOP_VALUES_LIMIT: usize = 8;

pub struct ProfilingOptions {
    /// Rows sampled per table. Bounded, not a full scan — keeps profiling one
    /// query per table regardless of table size.
    pub sample_rows: usize,
}

impl Default for ProfilingOptions {
    fn default() -> Self {
        Self { sample_rows: 5_000 }
    }
}

/// Sample and profile a single table. Read-only; samples via the same
/// paginated query path normal result-grid browsing uses.
pub async fn profile_table(
    registry: Arc<DatabaseRegistry>,
    connection_id: &str,
    db_type: DatabaseType,
    table: &TableContext,
    opts: &ProfilingOptions,
) -> Result<TableProfile> {
    let quoted = quote_identifier(&table.qualified_name, Some(db_type));
    let executor = DatabaseExecutor::from_registry(registry, connection_id)?;
    let base_sql = format!("SELECT * FROM {quoted}");
    let result = executor.execute_page(&base_sql, 0, opts.sample_rows).await?;
    Ok(build_profile_from_result(&result.columns, &result.rows))
}

/// Pure computation over already-fetched rows — split out from `profile_table`
/// so the statistics logic is unit-testable without a live database.
pub fn build_profile_from_result(columns: &[String], rows: &[Vec<Value>]) -> TableProfile {
    let sampled_rows = rows.len() as u64;
    let col_profiles = columns
        .iter()
        .enumerate()
        .map(|(idx, name)| {
            let values: Vec<Option<Value>> = rows
                .iter()
                .map(|row| match row.get(idx) {
                    Some(Value::Null) | None => None,
                    Some(v) => Some(v.clone()),
                })
                .collect();
            compute_column_profile(name, &values)
        })
        .collect();
    TableProfile { sampled_rows, columns: col_profiles }
}

fn compute_column_profile(name: &str, values: &[Option<Value>]) -> ColumnProfile {
    let total = values.len() as u64;
    let non_null: Vec<&Value> = values.iter().filter_map(|v| v.as_ref()).collect();
    let null_count = total.saturating_sub(non_null.len() as u64);
    let null_rate = if total > 0 { null_count as f32 / total as f32 } else { 0.0 };

    let mut counts: HashMap<String, u64> = HashMap::new();
    let mut numeric: Vec<f64> = Vec::new();
    let mut string_min_max: Option<(String, String)> = None;
    // Column "shape" is inferred from the actual decoded values, not the
    // driver's declared type name — those vary too much across dialects/drivers
    // to be a reliable signal, whereas the JSON values are already normalized.
    let mut saw_non_numeric = false;
    let mut saw_non_string = false;

    for v in &non_null {
        *counts.entry(value_key(v)).or_insert(0) += 1;
        match v {
            Value::Number(n) => {
                saw_non_string = true;
                if let Some(f) = n.as_f64() {
                    numeric.push(f);
                }
            }
            Value::String(s) => {
                saw_non_numeric = true;
                string_min_max = Some(match string_min_max.take() {
                    None => (s.clone(), s.clone()),
                    Some((min, max)) => (
                        if *s < min { s.clone() } else { min },
                        if *s > max { s.clone() } else { max },
                    ),
                });
            }
            _ => {
                saw_non_numeric = true;
                saw_non_string = true;
            }
        }
    }

    let is_all_numeric = !non_null.is_empty() && !saw_non_numeric;
    let is_all_string = !non_null.is_empty() && !saw_non_string;

    let (min, max) = if is_all_numeric && !numeric.is_empty() {
        let mn = numeric.iter().cloned().fold(f64::INFINITY, f64::min);
        let mx = numeric.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        (Some(format_number(mn)), Some(format_number(mx)))
    } else if let Some((mn, mx)) = string_min_max {
        (Some(mn), Some(mx))
    } else {
        (None, None)
    };

    let distinct_count = counts.len() as u64;
    let top_values = if !non_null.is_empty() && counts.len() <= TOP_VALUES_CARDINALITY_CAP {
        let mut pairs: Vec<(String, u64)> = counts.into_iter().collect();
        pairs.sort_by(|a, b| b.1.cmp(&a.1));
        pairs.truncate(TOP_VALUES_LIMIT);
        pairs
    } else {
        Vec::new()
    };

    let semantic_type = if is_all_string { guess_semantic_type(&non_null) } else { None };

    ColumnProfile {
        name: name.to_string(),
        null_rate,
        distinct_count,
        sampled_rows: total,
        min,
        max,
        top_values,
        semantic_type,
    }
}

fn value_key(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        other => other.to_string(),
    }
}

fn format_number(n: f64) -> String {
    if n.is_finite() && n.fract() == 0.0 && n.abs() < 1e15 {
        format!("{}", n as i64)
    } else {
        format!("{n}")
    }
}

/// Cheap, dependency-free heuristic guess at a column's semantic type from a
/// handful of sampled values — used only to make suggestion copy read more
/// naturally ("looks like an email column"), never for correctness decisions.
fn guess_semantic_type(values: &[&Value]) -> Option<String> {
    let sample: Vec<&str> = values.iter().filter_map(|v| v.as_str()).take(20).collect();
    if sample.is_empty() {
        return None;
    }
    let n = sample.len();
    let majority = |count: usize| count * 2 > n;

    if majority(sample.iter().filter(|s| is_email_like(s)).count()) {
        Some("email".to_string())
    } else if majority(sample.iter().filter(|s| s.starts_with("http://") || s.starts_with("https://")).count()) {
        Some("url".to_string())
    } else if majority(sample.iter().filter(|s| is_uuid_like(s)).count()) {
        Some("uuid".to_string())
    } else if majority(sample.iter().filter(|s| is_iso_date_like(s)).count()) {
        Some("date".to_string())
    } else {
        None
    }
}

fn is_email_like(s: &str) -> bool {
    s.contains('@') && s.contains('.') && !s.contains(' ') && !s.starts_with('@') && !s.ends_with('@')
}

fn is_uuid_like(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 36
        && b[8] == b'-'
        && b[13] == b'-'
        && b[18] == b'-'
        && b[23] == b'-'
        && s.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
}

fn is_iso_date_like(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() >= 10
        && b[0..4].iter().all(|c| c.is_ascii_digit())
        && b[4] == b'-'
        && b[5..7].iter().all(|c| c.is_ascii_digit())
        && b[7] == b'-'
        && b[8..10].iter().all(|c| c.is_ascii_digit())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(vals: Vec<Value>) -> Vec<Value> {
        vals
    }

    #[test]
    fn nulls_and_distinct_counted_correctly() {
        let columns = vec!["status".to_string()];
        let rows = vec![
            row(vec![Value::String("active".into())]),
            row(vec![Value::String("active".into())]),
            row(vec![Value::Null]),
            row(vec![Value::String("banned".into())]),
        ];
        let profile = build_profile_from_result(&columns, &rows);
        let col = &profile.columns[0];
        assert_eq!(col.sampled_rows, 4);
        assert!((col.null_rate - 0.25).abs() < 1e-6);
        assert_eq!(col.distinct_count, 2);
        assert_eq!(col.top_values.first().map(|(v, n)| (v.as_str(), *n)), Some(("active", 2)));
    }

    #[test]
    fn numeric_min_max() {
        let columns = vec!["amount".to_string()];
        let rows = vec![
            row(vec![Value::from(10)]),
            row(vec![Value::from(250)]),
            row(vec![Value::from(3)]),
        ];
        let profile = build_profile_from_result(&columns, &rows);
        let col = &profile.columns[0];
        assert_eq!(col.min.as_deref(), Some("3"));
        assert_eq!(col.max.as_deref(), Some("250"));
    }

    #[test]
    fn high_cardinality_column_skips_top_values() {
        let columns = vec!["id".to_string()];
        let rows: Vec<Vec<Value>> = (0..100).map(|i| row(vec![Value::from(i)])).collect();
        let profile = build_profile_from_result(&columns, &rows);
        assert!(profile.columns[0].top_values.is_empty());
    }

    #[test]
    fn email_column_detected() {
        let columns = vec!["contact".to_string()];
        let rows = vec![
            row(vec![Value::String("a@example.com".into())]),
            row(vec![Value::String("b@example.com".into())]),
            row(vec![Value::String("c@example.com".into())]),
        ];
        let profile = build_profile_from_result(&columns, &rows);
        assert_eq!(profile.columns[0].semantic_type.as_deref(), Some("email"));
    }
}
