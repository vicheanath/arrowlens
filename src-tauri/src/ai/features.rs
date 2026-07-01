//! Prompt construction for the AI features. Each function turns a schema
//! context (and feature-specific input) into a provider-agnostic `LlmRequest`.

use std::collections::HashMap;

use crate::ai::context::knowledge_store::TableProfile;
use crate::ai::context::schema_context::{SchemaContext, TableContext};
use crate::ai::provider::LlmRequest;

/// Explain Schema: narrate the database's purpose, entities, and relationships.
pub fn explain_schema_request(ctx: &SchemaContext) -> LlmRequest {
    let system = "You are a senior data architect. You explain database schemas to \
engineers clearly and concisely. Given a schema as DDL, describe: (1) the overall \
purpose/domain of the database, (2) each important table and what it represents, \
(3) how the tables relate (foreign keys, one-to-many, many-to-many join tables), and \
(4) any notable columns or design choices. Use Markdown with short sections and \
bullet points. Do not invent tables or columns that are not in the DDL."
        .to_string();

    let user = format!(
        "Explain this {} database schema:\n\n```sql\n{}\n```",
        ctx.dialect,
        ctx.to_ddl()
    );

    LlmRequest::new(system, user).with_max_tokens(2048)
}

/// Natural-Language → SQL. `prior_error` carries a validation/EXPLAIN failure
/// from a previous attempt to drive a self-repair retry.
pub fn nl_to_sql_request(
    ctx: &SchemaContext,
    question: &str,
    prior_error: Option<&str>,
    dialect_guidance: &str,
) -> LlmRequest {
    let system = format!(
        "You are an expert {dialect} SQL author. Given a database schema and a \
question in natural language, write ONE valid, read-only {dialect} SQL query that \
answers it.\n\nRules:\n\
- Output ONLY the SQL inside a single ```sql code block, no explanation.\n\
- Use SELECT/WITH only. Never write INSERT, UPDATE, DELETE, or DDL.\n\
- Use only tables and columns that appear in the schema.\n\
- Prefer explicit JOINs based on the foreign keys shown in the DDL comments.\n\
- Add a sensible LIMIT when the question implies a preview or 'top N'.\n\
- Follow the dialect conventions below exactly (identifier quoting, string \
functions, pagination).\n\n{guidance}",
        dialect = ctx.dialect,
        guidance = dialect_guidance
    );

    let mut user = format!(
        "Schema:\n\n```sql\n{}\n```\n\nQuestion: {}",
        ctx.to_ddl(),
        question.trim()
    );
    if let Some(err) = prior_error {
        user.push_str(&format!(
            "\n\nYour previous query failed validation with this error. Fix it and \
return only the corrected SQL:\n{}",
            err
        ));
    }

    LlmRequest::new(system, user).with_max_tokens(1024)
}

/// SQL Performance Advisor. Combines the query, its EXPLAIN plan, and the schema
/// (with row estimates) into actionable advice.
pub fn perf_advisor_request(
    ctx: &SchemaContext,
    sql: &str,
    plan: &str,
    dialect_guidance: &str,
) -> LlmRequest {
    let system = format!(
        "You are a SQL performance engineer. Given a query, its EXPLAIN \
plan, and the schema (with approximate row counts and primary keys), identify \
performance problems and concrete fixes.\n\nReturn Markdown with these sections:\n\
- **Summary** — one-line verdict.\n\
- **Findings** — a bullet per issue (full table scans, missing indexes, \
non-sargable predicates, implicit casts, risky join order/cardinality, SELECT *, \
over-fetching). Cite the table/column.\n\
- **Suggested indexes** — concrete CREATE INDEX statements where they would help.\n\
- **Rewrite** — an optional improved, still read-only version of the query in a \
```sql block, if one is warranted.\n\nBe specific and avoid generic advice. Do not \
invent columns that are not in the schema. Use the dialect conventions below for \
any SQL you write.\n\n{guidance}",
        guidance = dialect_guidance
    );

    let user = format!(
        "Dialect: {}\n\nSchema:\n```sql\n{}\n```\n\nQuery:\n```sql\n{}\n```\n\nEXPLAIN plan:\n```\n{}\n```",
        ctx.dialect,
        ctx.to_ddl(),
        sql.trim(),
        plan.trim()
    );

    LlmRequest::new(system, user).with_max_tokens(2048)
}

/// Fix a failing SQL query. Given the schema, the query that errored, and the
/// database's error message, return a corrected query that preserves intent.
pub fn fix_sql_request(
    ctx: &SchemaContext,
    failing_sql: &str,
    error: &str,
    dialect_guidance: &str,
) -> LlmRequest {
    let system = format!(
        "You are an expert {dialect} SQL author and debugger. A query failed when run \
against the database. Given the schema, the failing query, and the exact error \
message, return ONE corrected query that resolves the error.\n\nRules:\n\
- Output ONLY the corrected SQL inside a single ```sql code block, no explanation.\n\
- Preserve the original intent and statement kind; change only what is needed to fix the error.\n\
- Use only tables and columns that appear in the schema; correct typos to the closest real identifier.\n\
- Follow the dialect conventions below exactly (identifier quoting, functions, pagination).\n\n{guidance}",
        dialect = ctx.dialect,
        guidance = dialect_guidance
    );

    let user = format!(
        "Schema:\n\n```sql\n{}\n```\n\nFailing query:\n\n```sql\n{}\n```\n\nDatabase error:\n{}",
        ctx.to_ddl(),
        failing_sql.trim(),
        error.trim()
    );

    LlmRequest::new(system, user).with_max_tokens(1024)
}

/// Suggest a handful of natural-language questions a user could ask about this
/// schema, each paired with a ready-to-run SQL query. When `profiles` has
/// entries (from a built knowledge base), the prompt is grounded in real
/// sampled data — actual category values, ranges, null rates — instead of
/// structure alone, and questions/SQL are asked to reference that data. The
/// model must answer with a JSON array of `{question, sql, rationale}` objects.
pub fn suggest_questions_request(
    ctx: &SchemaContext,
    profiles: &HashMap<String, TableProfile>,
    dialect_guidance: &str,
    count: usize,
) -> LlmRequest {
    let system = format!(
        "You help users explore a {dialect} database. Given a schema (and, where available, a \
data profile sampled from the live tables), propose {count} concise, useful natural-language \
questions a user is likely to ask, each paired with ONE valid, read-only {dialect} SQL query that \
answers it.\n\nRules:\n\
- Output ONLY a JSON array of objects: [{{\"question\": \"...\", \"sql\": \"...\", \"rationale\": \"...\"}}, ...]. No prose, no code fences.\n\
- `sql` is a single SELECT/WITH statement using only tables/columns in the schema. Never write \
INSERT, UPDATE, DELETE, or DDL.\n\
- `rationale` is one short clause on why this is worth asking — cite a concrete data fact from the \
profile when one is available (e.g. a dominant category, a null rate, a value range).\n\
- Ground questions in the ACTUAL data profile where given — reference real category values, ranges, \
or notable patterns instead of generic phrasing.\n\
- Prefer questions spanning joins, aggregates, filtering, and ranking.\n\
- Follow the dialect conventions below exactly for any SQL you write.\n\n{guidance}",
        dialect = ctx.dialect,
        count = count,
        guidance = dialect_guidance
    );

    let mut user = format!("Schema:\n\n```sql\n{}\n```\n", ctx.to_ddl());
    if !profiles.is_empty() {
        user.push_str(&render_profiles(&ctx.tables, profiles));
    }

    LlmRequest::new(system, user).with_max_tokens(1536)
}

/// Batched table summarization for the knowledge base: one short 1–2 sentence
/// summary per table (purpose + notable data characteristics), used both to
/// display and as the text that gets embedded for retrieval.
pub fn summarize_tables_request(
    tables: &[&TableContext],
    profiles: &HashMap<String, TableProfile>,
    dialect: &str,
) -> LlmRequest {
    let system = "You are a data analyst. For each table given (DDL and, where available, a data \
profile sampled from the live table), write ONE short 1-2 sentence summary: what the table \
represents and any notable data characteristics — only state a characteristic if the profile \
genuinely shows it (a dominant category, a null rate, a value range). Do not restate the column \
list.\n\nRules:\n\
- Output ONLY a JSON array of objects: [{\"table\": \"qualified.name\", \"summary\": \"...\"}, ...], \
one entry per input table, no prose.\n\
- Never invent data that isn't shown in the DDL or profile."
        .to_string();

    let mut user = format!("Dialect: {dialect}\n\n");
    for table in tables {
        user.push_str(&format!("### {}\n", table.qualified_name));
        for col in table.columns.iter().take(MAX_PROFILE_COLUMNS_PER_TABLE) {
            user.push_str(&format!(
                "- {} {}{}\n",
                col.name,
                col.data_type,
                if col.is_primary_key { " (primary key)" } else { "" }
            ));
        }
        if table.columns.len() > MAX_PROFILE_COLUMNS_PER_TABLE {
            user.push_str(&format!("- … {} more column(s) omitted\n", table.columns.len() - MAX_PROFILE_COLUMNS_PER_TABLE));
        }
        if let Some(profile) = profiles.get(&table.qualified_name) {
            user.push_str(&render_column_profiles(&format!("(sampled {} rows)", profile.sampled_rows), profile));
        }
        user.push('\n');
    }

    LlmRequest::new(system, user).with_max_tokens(2048)
}

/// Character budget for the rendered data-profile block. Cloud models have
/// huge context windows and never notice this cap; local models (llama.cpp
/// servers, small Ollama models) often default to ~8k tokens, and an
/// unbounded profile section for a wide, many-table schema can blow well past
/// that (this is what produced the "n_keep >= n_ctx" overflow error). Roughly
/// 4 chars/token, so this budget targets ~1.5k tokens for the profile section.
const PROFILE_CHAR_BUDGET: usize = 6_000;

/// A single table's profile is capped to this many columns — a handful of
/// very wide tables could otherwise blow the whole budget on their own.
const MAX_PROFILE_COLUMNS_PER_TABLE: usize = 25;

/// Render a data-profile block for every table in `tables` that has an entry
/// in `profiles`, in the same order as `tables`, stopping once
/// `PROFILE_CHAR_BUDGET` is reached so the prompt stays bounded regardless of
/// schema size.
fn render_profiles(tables: &[TableContext], profiles: &HashMap<String, TableProfile>) -> String {
    let mut out = String::from("\nData profile (sampled from live tables):\n");
    let mut included = 0usize;
    let mut omitted = 0usize;
    for table in tables {
        let Some(profile) = profiles.get(&table.qualified_name) else { continue };
        let block = format!(
            "\n{}{}",
            table.qualified_name,
            render_column_profiles(&format!("(sampled {} rows)", profile.sampled_rows), profile)
        );
        if out.len() + block.len() > PROFILE_CHAR_BUDGET {
            omitted += 1;
            continue;
        }
        out.push_str(&block);
        included += 1;
    }
    if included == 0 {
        return String::new();
    }
    if omitted > 0 {
        out.push_str(&format!(
            "\n(profile omitted for {omitted} more table(s) to keep the prompt within the model's context budget)\n"
        ));
    }
    out
}

fn render_column_profiles(header_suffix: &str, profile: &TableProfile) -> String {
    let mut out = format!(" {header_suffix}:\n");
    let total_columns = profile.columns.len();
    for col in profile.columns.iter().take(MAX_PROFILE_COLUMNS_PER_TABLE) {
        out.push_str(&format!(
            "  - {}: null={:.0}%, distinct~{}",
            col.name,
            col.null_rate * 100.0,
            col.distinct_count
        ));
        if let (Some(min), Some(max)) = (&col.min, &col.max) {
            out.push_str(&format!(", range=[{min}, {max}]"));
        }
        if !col.top_values.is_empty() {
            let top: Vec<String> = col.top_values.iter().take(5).map(|(v, n)| format!("{v}×{n}")).collect();
            out.push_str(&format!(", top={}", top.join(", ")));
        }
        if let Some(semantic) = &col.semantic_type {
            out.push_str(&format!(", looks like {semantic}"));
        }
        out.push('\n');
    }
    if total_columns > MAX_PROFILE_COLUMNS_PER_TABLE {
        out.push_str(&format!("  … {} more column(s) omitted\n", total_columns - MAX_PROFILE_COLUMNS_PER_TABLE));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::context::knowledge_store::ColumnProfile;

    fn wide_profile(columns: usize) -> TableProfile {
        TableProfile {
            sampled_rows: 1000,
            columns: (0..columns)
                .map(|i| ColumnProfile {
                    name: format!("col_{i}"),
                    null_rate: 0.1,
                    distinct_count: 42,
                    sampled_rows: 1000,
                    min: Some("0".to_string()),
                    max: Some("999".to_string()),
                    top_values: vec![("a".to_string(), 10), ("b".to_string(), 5)],
                    semantic_type: None,
                })
                .collect(),
        }
    }

    #[test]
    fn wide_single_table_profile_is_capped() {
        let rendered = render_column_profiles("(sampled 1000 rows)", &wide_profile(200));
        assert!(rendered.lines().filter(|l| l.trim_start().starts_with("- col_")).count() <= MAX_PROFILE_COLUMNS_PER_TABLE);
        assert!(rendered.contains("more column(s) omitted"));
    }

    #[test]
    fn many_table_profile_stays_within_budget() {
        // Simulate a large schema (well over `max_tables`' worth of profiled
        // tables) — this is the exact shape that overflowed a small-context
        // local model before the size cap was added.
        let mut tables = Vec::new();
        let mut profiles = HashMap::new();
        for i in 0..60 {
            let name = format!("public.table_{i}");
            tables.push(TableContext {
                schema: "public".to_string(),
                name: format!("table_{i}"),
                qualified_name: name.clone(),
                columns: Vec::new(),
                row_estimate: None,
            });
            profiles.insert(name, wide_profile(30));
        }
        let rendered = render_profiles(&tables, &profiles);
        assert!(rendered.len() <= PROFILE_CHAR_BUDGET + 500, "rendered profile block grew unbounded: {} chars", rendered.len());
        assert!(rendered.contains("profile omitted for"));
    }
}
