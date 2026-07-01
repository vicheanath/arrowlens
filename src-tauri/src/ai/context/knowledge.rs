//! Orchestrates the schema knowledge base: profile → summarize → embed →
//! persist, plus the retrieval step (`select_relevant_tables`) that later
//! picks which tables matter for a specific question on a large schema.

use std::collections::HashMap;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::Arc;

use chrono::Utc;
use serde::Deserialize;

use crate::ai::config::AiConfig;
use crate::ai::context::knowledge_store::{ConnectionKnowledge, EmbeddingKind, TableKnowledge, TableProfile};
use crate::ai::context::profiling::{profile_table, ProfilingOptions};
use crate::ai::context::schema_context::{build_schema_context, TableContext};
use crate::ai::features::summarize_tables_request;
use crate::ai::provider::{build_provider, LlmProvider};
use crate::engine::database_registry::DatabaseRegistry;
use crate::error::{AppError, Result};

/// Fixed dimensionality for the keyword-hash fallback vector. Real provider
/// embeddings use whatever dimension the provider returns; the two are never
/// compared against each other (see `EmbeddingKind`).
const KEYWORD_VECTOR_DIM: usize = 256;

/// Tables summarized per LLM call during a knowledge-base build/refresh — see
/// the comment at the call site in `build_knowledge` for why this is batched.
const SUMMARIZE_BATCH_SIZE: usize = 10;

// --- Building --------------------------------------------------------------

/// Profile, summarize, and embed the highest-value tables in a connection's
/// schema, reusing entries from `existing` whose content hasn't changed
/// (incremental rebuild). `on_progress(table_name, done, total)` is called
/// once per table as it's processed, for a UI progress bar.
pub async fn build_knowledge(
    registry: Arc<DatabaseRegistry>,
    connection_id: &str,
    config: &AiConfig,
    existing: Option<ConnectionKnowledge>,
    mut on_progress: impl FnMut(&str, usize, usize),
) -> Result<ConnectionKnowledge> {
    let db_type = registry.get(connection_id).ok_or(AppError::DatabaseNotFound)?.database_type;

    // Full, untruncated schema so selection can rank by row estimate rather
    // than accept whatever `build_schema_context`'s alphabetical cutoff gives.
    let full_ctx = build_schema_context(registry.as_ref(), connection_id, None, usize::MAX).await?;
    let mut candidates = full_ctx.tables.clone();
    candidates.sort_by(|a, b| b.row_estimate.unwrap_or(0).cmp(&a.row_estimate.unwrap_or(0)));
    candidates.truncate(config.max_tables.max(1));

    let existing_by_name: HashMap<String, TableKnowledge> = existing
        .map(|kb| kb.tables.into_iter().map(|t| (t.qualified_name.clone(), t)).collect())
        .unwrap_or_default();

    let total = candidates.len();
    let mut profiles: HashMap<String, TableProfile> = HashMap::new();
    let mut to_refresh: Vec<TableContext> = Vec::new();
    let mut tables_out: Vec<TableKnowledge> = Vec::new();

    for (i, table) in candidates.iter().enumerate() {
        on_progress(&table.qualified_name, i + 1, total);

        // Sampling real rows is opt-in (`allow_sample_rows`); without it the
        // knowledge base is still built (summaries + embeddings from
        // structure/DDL alone), just without a data profile.
        let profile = if config.allow_sample_rows {
            match profile_table(registry.clone(), connection_id, db_type, table, &ProfilingOptions::default()).await
            {
                Ok(p) => Some(p),
                Err(e) => {
                    log::warn!("knowledge base: profiling {} failed: {e}", table.qualified_name);
                    None
                }
            }
        } else {
            None
        };

        let content_hash = table_content_hash(table, profile.as_ref());
        if let Some(prior) = existing_by_name.get(&table.qualified_name) {
            if prior.content_hash == content_hash {
                tables_out.push(prior.clone());
                continue;
            }
        }
        if let Some(p) = &profile {
            profiles.insert(table.qualified_name.clone(), p.clone());
        }
        to_refresh.push(table.clone());
    }

    if !to_refresh.is_empty() {
        let provider = build_provider(config)?;
        // Summarize in small batches rather than one call for every changed
        // table: a single request covering dozens of (possibly wide, profiled)
        // tables can overflow a local model's much smaller context window —
        // this is what produced the "context length exceeded" error on
        // small-context local models. Cloud models have ample headroom and
        // just receive a few more, still-small requests instead of one huge
        // one — no functional difference for them.
        let mut summaries: HashMap<String, String> = HashMap::new();
        for batch in to_refresh.chunks(SUMMARIZE_BATCH_SIZE) {
            let refs: Vec<&TableContext> = batch.iter().collect();
            let raw = provider.complete(summarize_tables_request(&refs, &profiles, &full_ctx.dialect)).await?;
            summaries.extend(parse_table_summaries(&raw));
        }

        let embed_inputs: Vec<(String, String)> = to_refresh
            .iter()
            .map(|t| {
                let summary = summaries.get(&t.qualified_name).cloned().unwrap_or_default();
                (t.qualified_name.clone(), format!("{} — {}", t.qualified_name, summary))
            })
            .collect();
        let (embeddings, kind) = embed_tables(provider.as_ref(), &embed_inputs).await;
        let embed_by_name: HashMap<String, Vec<f32>> = embeddings.into_iter().collect();

        for table in &to_refresh {
            let profile = profiles.get(&table.qualified_name).cloned();
            let content_hash = table_content_hash(table, profile.as_ref());
            tables_out.push(TableKnowledge {
                qualified_name: table.qualified_name.clone(),
                content_hash,
                summary: summaries.get(&table.qualified_name).cloned().unwrap_or_default(),
                profile,
                embedding: embed_by_name.get(&table.qualified_name).cloned().unwrap_or_default(),
                embedding_kind: kind,
            });
        }
    }

    Ok(ConnectionKnowledge {
        schema_hash: full_ctx.hash,
        built_at: Utc::now(),
        provider: config.provider,
        model: config.model.clone(),
        tables: tables_out,
    })
}

fn table_content_hash(table: &TableContext, profile: Option<&TableProfile>) -> String {
    let mut hasher = DefaultHasher::new();
    table.qualified_name.hash(&mut hasher);
    for col in &table.columns {
        col.name.hash(&mut hasher);
        col.data_type.hash(&mut hasher);
        col.nullable.hash(&mut hasher);
        col.is_primary_key.hash(&mut hasher);
    }
    if let Some(p) = profile {
        format!("{p:?}").hash(&mut hasher);
    }
    format!("{:016x}", hasher.finish())
}

#[derive(Deserialize)]
struct SummaryEntry {
    table: String,
    summary: String,
}

/// Best-effort JSON-array parse; a malformed response just yields empty
/// summaries rather than failing the whole build (embeddings still get built
/// from the qualified name alone).
fn parse_table_summaries(raw: &str) -> HashMap<String, String> {
    let cleaned = raw.trim();
    let Some(start) = cleaned.find('[') else { return HashMap::new() };
    let Some(end) = cleaned.rfind(']') else { return HashMap::new() };
    if end <= start {
        return HashMap::new();
    }
    serde_json::from_str::<Vec<SummaryEntry>>(&cleaned[start..=end])
        .map(|entries| entries.into_iter().map(|e| (e.table, e.summary)).collect())
        .unwrap_or_default()
}

// --- Embedding ---------------------------------------------------------------

/// Embed each `(qualified_name, text)` pair. Prefers the provider's real
/// embeddings; if the provider doesn't support them (Anthropic) or the call
/// fails for any reason, falls back to a deterministic keyword-hash vector for
/// every table so retrieval still works, just less semantically precise.
pub async fn embed_tables(
    provider: &dyn LlmProvider,
    tables: &[(String, String)],
) -> (Vec<(String, Vec<f32>)>, EmbeddingKind) {
    let texts: Vec<String> = tables.iter().map(|(_, text)| text.clone()).collect();
    match provider.embed(texts).await {
        Ok(vectors) if vectors.len() == tables.len() => {
            let out = tables.iter().zip(vectors).map(|((name, _), v)| (name.clone(), v)).collect();
            (out, EmbeddingKind::Vector)
        }
        _ => {
            let out = tables.iter().map(|(name, text)| (name.clone(), keyword_vector(text))).collect();
            (out, EmbeddingKind::Keyword)
        }
    }
}

/// Deterministic bag-of-words hashed vector (the "hashing trick"): every token
/// hashes into a fixed-size bucket with a hash-derived sign, so cosine
/// similarity between two texts roughly tracks vocabulary overlap without
/// needing a stored dictionary or an external model.
fn keyword_vector(text: &str) -> Vec<f32> {
    let mut v = vec![0f32; KEYWORD_VECTOR_DIM];
    for token in tokenize(text) {
        let mut hasher = DefaultHasher::new();
        token.hash(&mut hasher);
        let h = hasher.finish();
        let idx = (h % KEYWORD_VECTOR_DIM as u64) as usize;
        let sign = if (h >> 63) & 1 == 1 { 1.0 } else { -1.0 };
        v[idx] += sign;
    }
    v
}

fn tokenize(text: &str) -> Vec<String> {
    text.to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|s| s.len() >= 3)
        .map(|s| s.to_string())
        .collect()
}

fn cosine(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let dot: f32 = a.iter().zip(b).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }
    dot / (norm_a * norm_b)
}

// --- Retrieval ---------------------------------------------------------------

/// Pick the top-`k` tables most relevant to `query_text`, ranked by cosine
/// similarity against the knowledge base's stored embeddings. Embeds the query
/// with `provider` when the KB holds real embeddings; falls back to the same
/// keyword vector otherwise (or if the embed call itself fails).
pub async fn select_relevant_tables(
    provider: &dyn LlmProvider,
    kb: &ConnectionKnowledge,
    query_text: &str,
    k: usize,
) -> Vec<String> {
    let uses_vectors = kb.tables.first().map(|t| t.embedding_kind) == Some(EmbeddingKind::Vector);
    let query_vec = if uses_vectors {
        match provider.embed(vec![query_text.to_string()]).await {
            Ok(mut v) if !v.is_empty() => v.remove(0),
            // A transient embed failure at query time degrades to the keyword
            // vector; dimension mismatch against real embeddings then scores
            // every table ~0, which falls through to the caller's own
            // alphabetical-truncation fallback rather than erroring.
            _ => keyword_vector(query_text),
        }
    } else {
        keyword_vector(query_text)
    };
    rank_tables(&query_vec, kb, k)
}

/// Pure ranking step, split out from `select_relevant_tables` so it's
/// unit-testable without a provider/network dependency.
fn rank_tables(query_vec: &[f32], kb: &ConnectionKnowledge, k: usize) -> Vec<String> {
    let mut scored: Vec<(f32, &str)> =
        kb.tables.iter().map(|t| (cosine(query_vec, &t.embedding), t.qualified_name.as_str())).collect();
    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    scored.into_iter().take(k).map(|(_, name)| name.to_string()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn table(name: &str, text: &str) -> TableKnowledge {
        TableKnowledge {
            qualified_name: name.to_string(),
            content_hash: "h".to_string(),
            summary: text.to_string(),
            profile: None,
            embedding: keyword_vector(text),
            embedding_kind: EmbeddingKind::Keyword,
        }
    }

    #[test]
    fn keyword_vector_favors_overlapping_terms() {
        let a = keyword_vector("orders customer purchase history");
        let b = keyword_vector("customer orders and purchase totals");
        let c = keyword_vector("completely unrelated astronomy telescope data");
        assert!(cosine(&a, &b) > cosine(&a, &c));
    }

    #[test]
    fn rank_tables_puts_most_similar_first() {
        let kb = ConnectionKnowledge {
            schema_hash: "x".to_string(),
            built_at: Utc::now(),
            provider: crate::ai::config::AiProvider::Anthropic,
            model: "test".to_string(),
            tables: vec![
                table("public.orders", "orders customer total amount purchase"),
                table("public.weather_logs", "weather station temperature humidity telemetry"),
            ],
        };
        let query_vec = keyword_vector("top customers by total order amount");
        let ranked = rank_tables(&query_vec, &kb, 2);
        assert_eq!(ranked.first().map(String::as_str), Some("public.orders"));
    }

    #[test]
    fn rank_tables_respects_k() {
        let kb = ConnectionKnowledge {
            schema_hash: "x".to_string(),
            built_at: Utc::now(),
            provider: crate::ai::config::AiProvider::Anthropic,
            model: "test".to_string(),
            tables: vec![
                table("a", "alpha bravo charlie"),
                table("b", "delta echo foxtrot"),
                table("c", "golf hotel india"),
            ],
        };
        let ranked = rank_tables(&keyword_vector("alpha bravo"), &kb, 1);
        assert_eq!(ranked.len(), 1);
    }
}
