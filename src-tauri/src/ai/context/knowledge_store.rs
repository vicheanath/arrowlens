//! Persisted, per-connection "schema knowledge base": data profiles, AI-written
//! table summaries, and embeddings (or a keyword-vector fallback) used to (a)
//! ground suggestions in real data and (b) retrieve only the relevant tables
//! for a question on large schemas instead of an alphabetical-first-N cutoff.
//!
//! One JSON file per connection under `{app_data_dir}/ai_knowledge/`, written
//! atomically — mirrors the pattern in `cache::app_store::AppStore`.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};

use crate::ai::config::AiProvider;
use crate::error::{AppError, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnProfile {
    pub name: String,
    pub null_rate: f32,
    pub distinct_count: u64,
    pub sampled_rows: u64,
    pub min: Option<String>,
    pub max: Option<String>,
    /// `(value, count)` pairs, most frequent first — only populated for columns
    /// whose sampled cardinality looks categorical (see `profiling.rs`).
    pub top_values: Vec<(String, u64)>,
    /// Cheap heuristic guess: "email" | "url" | "uuid" | "date".
    pub semantic_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableProfile {
    pub sampled_rows: u64,
    pub columns: Vec<ColumnProfile>,
}

/// Whether `TableKnowledge::embedding` is a real provider embedding (comparable
/// only against vectors from the same provider/model) or the deterministic
/// keyword-hash fallback used when the provider has no embeddings API (e.g.
/// Anthropic) or an embedding call failed. Both are cosine-scored the same way.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EmbeddingKind {
    Vector,
    Keyword,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableKnowledge {
    pub qualified_name: String,
    /// Hash of this table's own DDL shape + profile — lets a refresh skip
    /// re-summarizing/re-embedding tables that haven't changed.
    pub content_hash: String,
    pub summary: String,
    pub profile: Option<TableProfile>,
    pub embedding: Vec<f32>,
    pub embedding_kind: EmbeddingKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionKnowledge {
    /// `SchemaContext::hash` at build time — a mismatch means the schema
    /// changed since this knowledge base was built.
    pub schema_hash: String,
    pub built_at: DateTime<Utc>,
    /// Which provider/model produced the summaries+embeddings. Embeddings
    /// aren't comparable across providers/models, so retrieval checks this
    /// matches the active config before trusting the vectors.
    pub provider: AiProvider,
    pub model: String,
    pub tables: Vec<TableKnowledge>,
}

pub struct KnowledgeStore {
    dir: PathBuf,
    cache: RwLock<HashMap<String, ConnectionKnowledge>>,
}

impl KnowledgeStore {
    pub fn initialize(app_data_dir: &Path) -> Result<Self> {
        let dir = app_data_dir.join("ai_knowledge");
        fs::create_dir_all(&dir)?;
        Ok(Self { dir, cache: RwLock::new(HashMap::new()) })
    }

    fn file_for(&self, connection_id: &str) -> PathBuf {
        // Connection ids are UUIDs, but be defensive about what ends up in a path.
        let safe: String = connection_id
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
            .collect();
        self.dir.join(format!("{safe}.json"))
    }

    /// Load a connection's knowledge base, checking the in-memory cache first.
    pub fn get(&self, connection_id: &str) -> Option<ConnectionKnowledge> {
        if let Some(kb) = self.cache.read().get(connection_id) {
            return Some(kb.clone());
        }
        let path = self.file_for(connection_id);
        if !path.exists() {
            return None;
        }
        let raw = fs::read_to_string(&path).ok()?;
        let kb: ConnectionKnowledge = serde_json::from_str(&raw).ok()?;
        self.cache.write().insert(connection_id.to_string(), kb.clone());
        Some(kb)
    }

    pub fn save(&self, connection_id: &str, kb: &ConnectionKnowledge) -> Result<()> {
        let path = self.file_for(connection_id);
        let bytes = serde_json::to_vec_pretty(kb)
            .map_err(|e| AppError::CacheError(format!("Failed to serialize knowledge base: {e}")))?;
        let tmp_path = path.with_extension("json.tmp");
        fs::write(&tmp_path, bytes)?;
        fs::rename(&tmp_path, &path).map_err(|e| {
            AppError::CacheError(format!("Failed to atomically replace knowledge file: {e}"))
        })?;
        self.cache.write().insert(connection_id.to_string(), kb.clone());
        Ok(())
    }

    /// Drop a connection's knowledge base (e.g. when the connection itself is removed).
    pub fn delete(&self, connection_id: &str) {
        self.cache.write().remove(connection_id);
        let _ = fs::remove_file(self.file_for(connection_id));
    }
}
