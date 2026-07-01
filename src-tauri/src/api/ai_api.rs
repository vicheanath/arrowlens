use std::collections::HashMap;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use crate::ai::config::{AiConfigDto, AiConfigUpdate, AiProvider};
use crate::ai::context::knowledge;
use crate::ai::context::knowledge_store::{ConnectionKnowledge, EmbeddingKind, KnowledgeStore, TableProfile};
use crate::ai::context::schema_context::{build_focused_schema_context, build_schema_context, SchemaContext};
use crate::ai::provider::{build_provider, LlmRequest};
use crate::ai::validate::{extract_sql, validate_read_only_sql, ValidationReport};
use crate::ai::{features, AiState};
use crate::cache::app_store::AppStore;
use crate::engine::database_executor::DatabaseExecutor;
use crate::engine::database_registry::{DatabaseRegistry, DatabaseType};
use crate::engine::provider::provider_for;
use crate::engine::query_executor::QueryExecutor;
use crate::error::{AppError, Result};

/// Return the secret-free AI configuration.
#[tauri::command]
pub async fn ai_get_config(ai: State<'_, Arc<AiState>>) -> Result<AiConfigDto> {
    Ok(ai.config().to_dto())
}

/// Apply a configuration update, persist it, and return the new view.
#[tauri::command]
pub async fn ai_update_config(
    update: AiConfigUpdate,
    ai: State<'_, Arc<AiState>>,
    app_store: State<'_, Arc<AppStore>>,
) -> Result<AiConfigDto> {
    let updated = ai.update(|config| config.apply(update));
    app_store.save_ai_config(&updated)?;
    // Schema/explanation cache may depend on provider/model; clear on change.
    ai.cache.clear();
    Ok(updated.to_dto())
}

/// Build and return the schema context (useful for previewing what is sent to
/// the model, and for the schema-explanation UI).
#[tauri::command]
pub async fn ai_build_schema_context(
    connection_id: String,
    table_filter: Option<String>,
    ai: State<'_, Arc<AiState>>,
    db_registry: State<'_, Arc<DatabaseRegistry>>,
) -> Result<SchemaContext> {
    let config = ai.config();
    build_schema_context(
        db_registry.inner().as_ref(),
        &connection_id,
        table_filter.as_deref(),
        config.max_tables,
    )
    .await
}

/// Explain a database schema. Streams Markdown via `ai-delta-{request_id}` and
/// returns the full text.
#[tauri::command]
pub async fn ai_explain_schema(
    request_id: String,
    connection_id: String,
    table_filter: Option<String>,
    app: AppHandle,
    ai: State<'_, Arc<AiState>>,
    db_registry: State<'_, Arc<DatabaseRegistry>>,
) -> Result<String> {
    let config = ai.config();
    ensure_ready(&config)?;

    let ctx = build_schema_context(
        db_registry.inner().as_ref(),
        &connection_id,
        table_filter.as_deref(),
        config.max_tables,
    )
    .await?;

    // Nothing to explain — tell the user plainly instead of asking the model to
    // narrate an empty schema (which yields a useless or empty answer).
    if ctx.tables.is_empty() {
        return Err(AppError::AiError(
            "No tables found to explain. This database has no tables in its user schemas \
             (system schemas are excluded)."
                .to_string(),
        ));
    }

    // Stable schema → cacheable explanation. Ignore an empty cache entry so a
    // prior failed run can't keep masking a real explanation.
    let cache_key = format!("explain:{}:{}:{}", config.provider as u8, config.model, ctx.hash);
    if let Some(cached) = ai.cache.get(&cache_key) {
        if !cached.trim().is_empty() {
            let _ = app.emit(&format!("ai-delta-{}", request_id), cached.clone());
            return Ok(cached);
        }
    }

    let req = features::explain_schema_request(&ctx);
    let provider = build_provider(&config)?;
    let full = stream_to_events(&app, &request_id, provider.as_ref(), req).await?;
    // An empty completion (e.g. the schema overflowed a local model's context, or
    // the model returned no content) must surface as an error — otherwise the UI
    // silently falls back to its placeholder and looks like nothing happened.
    if full.trim().is_empty() {
        return Err(AppError::AiError(
            "The model returned an empty response. The schema may be too large for the \
             selected model's context window — try a model with a larger context, or narrow \
             the connection to fewer tables."
                .to_string(),
        ));
    }
    ai.cache.put(cache_key, full.clone());
    Ok(full)
}

/// Result of a Natural-Language → SQL generation.
#[derive(Debug, Clone, Serialize)]
pub struct NlSqlResult {
    pub sql: String,
    pub validation: ValidationReport,
    /// A self-repair pass was used.
    pub repaired: bool,
    /// The generated SQL passed an EXPLAIN dry-run against the live database.
    pub explain_ok: bool,
    pub explain_error: Option<String>,
}

/// Generate SQL from a natural-language question. Streams the raw generation via
/// `ai-delta-{request_id}`, then validates and (best-effort) dry-runs it.
#[tauri::command]
pub async fn ai_generate_sql(
    request_id: String,
    connection_id: String,
    question: String,
    app: AppHandle,
    ai: State<'_, Arc<AiState>>,
    db_registry: State<'_, Arc<DatabaseRegistry>>,
    knowledge_store: State<'_, Arc<KnowledgeStore>>,
) -> Result<NlSqlResult> {
    let config = ai.config();
    ensure_ready(&config)?;
    if question.trim().is_empty() {
        return Err(AppError::AiError("Question cannot be empty".to_string()));
    }

    let db_type = db_registry.get(&connection_id).ok_or(AppError::DatabaseNotFound)?.database_type;
    let provider = build_provider(&config)?;
    let ctx = resolve_generate_context(
        db_registry.inner().as_ref(),
        &connection_id,
        &question,
        &config,
        provider.as_ref(),
        knowledge_store.inner().as_ref(),
    )
    .await?;
    let guidance = provider_for(db_type).sql_dialect_guidance();

    // First attempt.
    let req = features::nl_to_sql_request(&ctx, &question, None, guidance);
    let raw = stream_to_events(&app, &request_id, provider.as_ref(), req).await?;
    let mut sql = extract_sql(&raw);
    let mut validation = validate_read_only_sql(&sql, Some(db_type));
    let mut repaired = false;

    // Self-repair once on static validation failure.
    if !validation.is_safe() {
        if let Some(err) = validation.message.clone() {
            let req = features::nl_to_sql_request(&ctx, &question, Some(&err), guidance);
            let raw2 = stream_to_events(&app, &request_id, provider.as_ref(), req).await?;
            sql = extract_sql(&raw2);
            validation = validate_read_only_sql(&sql, Some(db_type));
            repaired = true;
        }
    }

    // Best-effort EXPLAIN dry-run (only for safe, read-only SQL).
    let (mut explain_ok, mut explain_error) = (false, None);
    if validation.is_safe() {
        match run_explain(db_registry.inner().clone(), &connection_id, db_type, &sql).await {
            Ok(_) => explain_ok = true,
            Err(e) => {
                let msg = e.to_string();
                // One more repair attempt using the planner's error.
                if !repaired {
                    let req = features::nl_to_sql_request(&ctx, &question, Some(&msg), guidance);
                    if let Ok(raw3) = stream_to_events(&app, &request_id, provider.as_ref(), req).await {
                        let candidate = extract_sql(&raw3);
                        let revalidate = validate_read_only_sql(&candidate, Some(db_type));
                        if revalidate.is_safe() {
                            match run_explain(db_registry.inner().clone(), &connection_id, db_type, &candidate).await {
                                Ok(_) => {
                                    sql = candidate;
                                    validation = revalidate;
                                    explain_ok = true;
                                    repaired = true;
                                }
                                Err(e2) => {
                                    explain_error = Some(e2.to_string());
                                }
                            }
                        } else {
                            explain_error = Some(msg);
                        }
                    } else {
                        explain_error = Some(msg);
                    }
                } else {
                    explain_error = Some(msg);
                }
            }
        }
    }

    Ok(NlSqlResult { sql, validation, repaired, explain_ok, explain_error })
}

/// Fix a query that failed, given its error message. Streams the corrected SQL
/// via `ai-delta-{request_id}`, then validates and (best-effort) dry-runs it.
#[tauri::command]
pub async fn ai_fix_sql(
    request_id: String,
    connection_id: String,
    sql: String,
    error_message: String,
    app: AppHandle,
    ai: State<'_, Arc<AiState>>,
    db_registry: State<'_, Arc<DatabaseRegistry>>,
) -> Result<NlSqlResult> {
    let config = ai.config();
    ensure_ready(&config)?;
    if sql.trim().is_empty() {
        return Err(AppError::QuerySyntaxError("Query cannot be empty".to_string()));
    }

    let db_type = db_registry
        .get(&connection_id)
        .ok_or(AppError::DatabaseNotFound)?
        .database_type;
    let ctx = build_schema_context(
        db_registry.inner().as_ref(),
        &connection_id,
        None,
        config.max_tables,
    )
    .await?;
    let provider = build_provider(&config)?;
    let guidance = provider_for(db_type).sql_dialect_guidance();

    // First fix attempt.
    let req = features::fix_sql_request(&ctx, &sql, &error_message, guidance);
    let raw = stream_to_events(&app, &request_id, provider.as_ref(), req).await?;
    let mut fixed = extract_sql(&raw);
    let mut validation = validate_read_only_sql(&fixed, Some(db_type));
    let mut repaired = false;
    let (mut explain_ok, mut explain_error) = (false, None);

    // Verify the fix with an EXPLAIN dry-run; one more pass if the planner still
    // rejects it (using the planner's own error as the new hint).
    if validation.is_safe() {
        match run_explain(db_registry.inner().clone(), &connection_id, db_type, &fixed).await {
            Ok(_) => explain_ok = true,
            Err(e) => {
                let msg = e.to_string();
                let req2 = features::fix_sql_request(&ctx, &fixed, &msg, guidance);
                if let Ok(raw2) = stream_to_events(&app, &request_id, provider.as_ref(), req2).await {
                    let candidate = extract_sql(&raw2);
                    let revalidate = validate_read_only_sql(&candidate, Some(db_type));
                    if revalidate.is_safe()
                        && run_explain(db_registry.inner().clone(), &connection_id, db_type, &candidate)
                            .await
                            .is_ok()
                    {
                        fixed = candidate;
                        validation = revalidate;
                        explain_ok = true;
                        repaired = true;
                    } else {
                        explain_error = Some(msg);
                    }
                } else {
                    explain_error = Some(msg);
                }
            }
        }
    }

    Ok(NlSqlResult { sql: fixed, validation, repaired, explain_ok, explain_error })
}

/// A suggested natural-language question paired with a ready-to-run,
/// validated SQL query that answers it.
#[derive(Debug, Clone, Serialize)]
pub struct SuggestedQuery {
    pub question: String,
    pub sql: String,
    pub rationale: Option<String>,
}

/// Suggest a few natural-language questions for the NL→SQL box, each with a
/// ready SQL query, grounded in the connected database's schema — and, when a
/// knowledge base has been built for this connection, its real data profile
/// (actual category values, ranges, null rates) instead of structure alone.
/// Non-streaming; cached by schema hash.
#[tauri::command]
pub async fn ai_suggest_questions(
    connection_id: String,
    ai: State<'_, Arc<AiState>>,
    db_registry: State<'_, Arc<DatabaseRegistry>>,
    knowledge_store: State<'_, Arc<KnowledgeStore>>,
) -> Result<Vec<SuggestedQuery>> {
    let config = ai.config();
    ensure_ready(&config)?;

    let db_type = db_registry.get(&connection_id).ok_or(AppError::DatabaseNotFound)?.database_type;
    // Build the full, untruncated schema once — the knowledge base's
    // `schema_hash` is always computed against the full schema (so it can
    // cover more tables than fit in one prompt), so staleness must be checked
    // against that, not against the alphabetically-truncated prompt context.
    // Comparing against the truncated context's hash here previously meant
    // the profile lookup below silently missed on every schema bigger than
    // `max_tables` — exactly the case this feature targets.
    let full_ctx = build_schema_context(db_registry.inner().as_ref(), &connection_id, None, usize::MAX).await?;
    let ctx = alphabetical_truncate(full_ctx.clone(), config.max_tables);

    let cache_key = format!("suggest:{}:{}:{}", config.provider as u8, config.model, ctx.hash);
    if let Some(cached) = ai.cache.get(&cache_key) {
        return Ok(parse_suggested_queries(&cached, db_type));
    }

    // Data profiles are provider-agnostic facts, not model output, so they're
    // reused regardless of which provider built the knowledge base — only
    // `schema_hash` needs to match the schema being queried right now.
    let profiles: HashMap<String, TableProfile> = knowledge_store
        .get(&connection_id)
        .filter(|kb| kb.schema_hash == full_ctx.hash)
        .map(|kb| kb.tables.into_iter().filter_map(|t| t.profile.map(|p| (t.qualified_name, p))).collect())
        .unwrap_or_default();

    let guidance = provider_for(db_type).sql_dialect_guidance();
    let req = features::suggest_questions_request(&ctx, &profiles, guidance, 6);
    let provider = build_provider(&config)?;
    let raw = provider.complete(req).await?;

    let suggestions = parse_suggested_queries(&raw, db_type);
    if !suggestions.is_empty() {
        ai.cache.put(cache_key, raw);
    }
    Ok(suggestions)
}

#[derive(Deserialize)]
struct RawSuggestedQuery {
    question: String,
    sql: String,
    #[serde(default)]
    rationale: Option<String>,
}

/// Parse the model's reply into validated suggestions. Tolerates code fences
/// and prose by extracting the first JSON array; any entry whose SQL doesn't
/// pass the same read-only static validation used for NL→SQL is dropped
/// rather than surfaced as a runnable-looking but unsafe suggestion.
fn parse_suggested_queries(raw: &str, db_type: DatabaseType) -> Vec<SuggestedQuery> {
    let cleaned = raw.trim();
    let entries: Vec<RawSuggestedQuery> = (|| {
        let start = cleaned.find('[')?;
        let end = cleaned.rfind(']')?;
        if end <= start {
            return None;
        }
        serde_json::from_str::<Vec<RawSuggestedQuery>>(&cleaned[start..=end]).ok()
    })()
    .unwrap_or_default();

    entries
        .into_iter()
        .filter_map(|entry| {
            let question = entry.question.trim().to_string();
            let sql = extract_sql(&entry.sql);
            if question.len() <= 3 || sql.is_empty() {
                return None;
            }
            if !validate_read_only_sql(&sql, Some(db_type)).is_safe() {
                return None;
            }
            Some(SuggestedQuery {
                question,
                sql,
                rationale: entry.rationale.map(|r| r.trim().to_string()).filter(|r| !r.is_empty()),
            })
        })
        .take(6)
        .collect()
}

/// Analyze a query's performance using its EXPLAIN plan and the schema. Streams
/// Markdown advice via `ai-delta-{request_id}`.
#[tauri::command]
pub async fn ai_advise_performance(
    request_id: String,
    connection_id: String,
    sql: String,
    app: AppHandle,
    ai: State<'_, Arc<AiState>>,
    db_registry: State<'_, Arc<DatabaseRegistry>>,
) -> Result<String> {
    let config = ai.config();
    ensure_ready(&config)?;
    if sql.trim().is_empty() {
        return Err(AppError::QuerySyntaxError("Query cannot be empty".to_string()));
    }

    let db_type = db_registry.get(&connection_id).ok_or(AppError::DatabaseNotFound)?.database_type;
    let ctx = build_schema_context(
        db_registry.inner().as_ref(),
        &connection_id,
        None,
        config.max_tables,
    )
    .await?;

    // Get the plan (best-effort; a failed EXPLAIN still yields useful advice).
    let plan = match run_explain(db_registry.inner().clone(), &connection_id, db_type, &sql).await {
        Ok(plan) => plan,
        Err(e) => format!("(EXPLAIN failed: {})", e),
    };

    let guidance = provider_for(db_type).sql_dialect_guidance();
    let req = features::perf_advisor_request(&ctx, &sql, &plan, guidance);
    let provider = build_provider(&config)?;
    let full = stream_to_events(&app, &request_id, provider.as_ref(), req).await?;
    if full.trim().is_empty() {
        return Err(AppError::AiError(
            "The model returned an empty response. The schema or plan may be too large for the \
             selected model's context window — try a model with a larger context."
                .to_string(),
        ));
    }
    Ok(full)
}

/// Snapshot of a connection's persisted knowledge base, for the "Build
/// knowledge" UI to show whether one exists, is current, and what it covers.
#[derive(Debug, Clone, Serialize)]
pub struct KnowledgeStatus {
    pub exists: bool,
    /// True when `schema_hash` matches the schema as introspected right now.
    pub is_current: bool,
    pub table_count: usize,
    /// Tables that actually have a sampled data profile (as opposed to
    /// structure-only summary/embedding). Zero here — even when `exists` is
    /// true — almost always means the knowledge base was built with "Allow
    /// sample rows" off, so suggestions/retrieval have no real data to ground
    /// answers in even though a knowledge base technically exists.
    pub profiled_count: usize,
    pub embedded_count: usize,
    pub embedding_kind: Option<String>,
    pub built_at: Option<chrono::DateTime<chrono::Utc>>,
    pub provider: Option<AiProvider>,
    pub model: Option<String>,
}

fn knowledge_status(kb: Option<&ConnectionKnowledge>, current_schema_hash: &str) -> KnowledgeStatus {
    match kb {
        Some(kb) => KnowledgeStatus {
            exists: true,
            is_current: kb.schema_hash == current_schema_hash,
            table_count: kb.tables.len(),
            profiled_count: kb.tables.iter().filter(|t| t.profile.is_some()).count(),
            embedded_count: kb.tables.iter().filter(|t| !t.embedding.is_empty()).count(),
            embedding_kind: kb.tables.first().map(|t| match t.embedding_kind {
                EmbeddingKind::Vector => "vector".to_string(),
                EmbeddingKind::Keyword => "keyword".to_string(),
            }),
            built_at: Some(kb.built_at),
            provider: Some(kb.provider),
            model: Some(kb.model.clone()),
        },
        None => KnowledgeStatus {
            exists: false,
            is_current: false,
            table_count: 0,
            profiled_count: 0,
            embedded_count: 0,
            embedding_kind: None,
            built_at: None,
            provider: None,
            model: None,
        },
    }
}

/// Report whether a knowledge base exists for this connection, and whether
/// it's still current for the schema as introspected right now.
#[tauri::command]
pub async fn ai_knowledge_status(
    connection_id: String,
    db_registry: State<'_, Arc<DatabaseRegistry>>,
    knowledge_store: State<'_, Arc<KnowledgeStore>>,
) -> Result<KnowledgeStatus> {
    let ctx = build_schema_context(db_registry.inner().as_ref(), &connection_id, None, usize::MAX).await?;
    Ok(knowledge_status(knowledge_store.get(&connection_id).as_ref(), &ctx.hash))
}

/// Progress event payload emitted on `ai-knowledge-progress-{request_id}` as
/// each table is profiled/summarized/embedded.
#[derive(Debug, Clone, Serialize)]
struct KnowledgeProgress {
    table: String,
    done: usize,
    total: usize,
}

/// Build (or incrementally refresh) the persisted knowledge base for a
/// connection: profile the highest-value tables, summarize them, embed them
/// (or fall back to a keyword vector), and persist to disk. Explicit and
/// opt-in — this samples real data (when `allow_sample_rows` is on) and makes
/// LLM calls, so it only runs when the user asks for it.
#[tauri::command]
pub async fn ai_build_knowledge(
    request_id: String,
    connection_id: String,
    app: AppHandle,
    ai: State<'_, Arc<AiState>>,
    db_registry: State<'_, Arc<DatabaseRegistry>>,
    knowledge_store: State<'_, Arc<KnowledgeStore>>,
) -> Result<KnowledgeStatus> {
    let config = ai.config();
    ensure_ready(&config)?;

    let existing = knowledge_store.get(&connection_id);
    let event = format!("ai-knowledge-progress-{}", request_id);
    let app_for_progress = app.clone();

    let kb = knowledge::build_knowledge(
        db_registry.inner().clone(),
        &connection_id,
        &config,
        existing,
        |table, done, total| {
            let _ = app_for_progress.emit(&event, KnowledgeProgress { table: table.to_string(), done, total });
        },
    )
    .await?;

    knowledge_store.save(&connection_id, &kb)?;
    let schema_hash = kb.schema_hash.clone();
    Ok(knowledge_status(Some(&kb), &schema_hash))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Resolve the schema context for NL→SQL: the full schema when it fits under
/// `max_tables`, otherwise a knowledge-base-driven focused context (only the
/// tables retrieval judges relevant to `question`) when a current, matching
/// knowledge base exists — falling back to today's alphabetical-first-N
/// truncation when it doesn't. Additive: a connection with no knowledge base
/// behaves exactly as before.
async fn resolve_generate_context(
    db_registry: &DatabaseRegistry,
    connection_id: &str,
    question: &str,
    config: &crate::ai::config::AiConfig,
    provider: &dyn crate::ai::provider::LlmProvider,
    knowledge_store: &KnowledgeStore,
) -> Result<SchemaContext> {
    let full_ctx = build_schema_context(db_registry, connection_id, None, usize::MAX).await?;
    if full_ctx.tables.len() <= config.max_tables {
        return Ok(full_ctx);
    }

    let kb = knowledge_store
        .get(connection_id)
        .filter(|kb| kb.schema_hash == full_ctx.hash && kb.provider == config.provider);
    if let Some(kb) = kb {
        let relevant = knowledge::select_relevant_tables(provider, &kb, question, config.max_tables).await;
        if !relevant.is_empty() {
            return build_focused_schema_context(db_registry, connection_id, &relevant, config.max_tables).await;
        }
    }

    Ok(alphabetical_truncate(full_ctx, config.max_tables))
}

fn alphabetical_truncate(mut ctx: SchemaContext, max_tables: usize) -> SchemaContext {
    let truncated = ctx.tables.len() > max_tables;
    if truncated {
        ctx.tables.truncate(max_tables);
    }
    ctx.truncated = truncated;
    ctx.recompute_hash();
    ctx
}

fn ensure_ready(config: &crate::ai::config::AiConfig) -> Result<()> {
    if !config.enabled {
        return Err(AppError::AiNotConfigured("AI is disabled".to_string()));
    }
    if !config.is_ready() {
        return Err(AppError::AiNotConfigured(
            "Provider is missing an API key or required setting".to_string(),
        ));
    }
    Ok(())
}

/// Forward provider stream deltas to `ai-delta-{request_id}` Tauri events while
/// accumulating the full text.
async fn stream_to_events(
    app: &AppHandle,
    request_id: &str,
    provider: &dyn crate::ai::provider::LlmProvider,
    req: LlmRequest,
) -> Result<String> {
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();
    let app_clone = app.clone();
    let event = format!("ai-delta-{}", request_id);
    let forward = tokio::spawn(async move {
        while let Some(delta) = rx.recv().await {
            let _ = app_clone.emit(&event, delta);
        }
    });

    let result = provider.stream(req, tx).await;
    let _ = forward.await;
    result
}

/// Run an EXPLAIN (no execution of the underlying query) and return the plan as
/// text. Uses the provider's dialect-specific plan SQL.
async fn run_explain(
    db_registry: Arc<DatabaseRegistry>,
    connection_id: &str,
    db_type: DatabaseType,
    sql: &str,
) -> Result<String> {
    let explain_sql = provider_for(db_type).explain_sql(sql, false);

    let executor = DatabaseExecutor::from_registry(db_registry, connection_id)?;
    let result = executor.execute(&explain_sql).await?;

    let plan_lines: Vec<String> = result
        .rows
        .iter()
        .map(|row| {
            row.iter()
                .map(|v| match v {
                    serde_json::Value::String(s) => s.clone(),
                    other => other.to_string(),
                })
                .collect::<Vec<_>>()
                .join("  ")
        })
        .collect();

    Ok(plan_lines.join("\n"))
}
