use async_trait::async_trait;
use serde_json::json;
use tokio::sync::mpsc::UnboundedSender;

use super::{error_from_response, for_each_line, http_client, LlmProvider, LlmRequest};
use crate::ai::config::AiConfig;
use crate::error::{AppError, Result};

const DEFAULT_BASE: &str = "http://localhost:11434";

/// Local Ollama provider via `/api/chat` (NDJSON streaming). No API key, no
/// network egress — satisfies strict local-only setups.
pub struct OllamaProvider {
    model: String,
    base_url: String,
}

impl OllamaProvider {
    pub fn from_config(config: &AiConfig) -> Result<Self> {
        let base_url = config
            .base_url
            .clone()
            .filter(|u| !u.trim().is_empty())
            .unwrap_or_else(|| DEFAULT_BASE.to_string());
        Ok(Self { model: config.model.clone(), base_url })
    }
}

#[async_trait]
impl LlmProvider for OllamaProvider {
    async fn stream(&self, req: LlmRequest, tx: UnboundedSender<String>) -> Result<String> {
        let mut messages = vec![json!({ "role": "system", "content": req.system })];
        for m in &req.messages {
            messages.push(json!({ "role": m.role, "content": m.content }));
        }

        let body = json!({
            "model": self.model,
            "messages": messages,
            "stream": true,
            "options": { "temperature": req.temperature },
        });

        let url = format!("{}/api/chat", self.base_url.trim_end_matches('/'));
        let resp = http_client()?
            .post(&url)
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::AiError(format!("Request failed (is Ollama running?): {e}")))?;

        if !resp.status().is_success() {
            return Err(error_from_response(resp).await);
        }

        // Ollama streams newline-delimited JSON objects, not SSE.
        let mut full = String::new();
        for_each_line(resp, |line| {
            let line = line.trim();
            if line.is_empty() {
                return Ok(false);
            }
            let value: serde_json::Value = match serde_json::from_str(line) {
                Ok(v) => v,
                Err(_) => return Ok(false),
            };
            if let Some(text) = value
                .get("message")
                .and_then(|m| m.get("content"))
                .and_then(|t| t.as_str())
            {
                full.push_str(text);
                let _ = tx.send(text.to_string());
            }
            Ok(value.get("done").and_then(|d| d.as_bool()).unwrap_or(false))
        })
        .await?;

        Ok(full)
    }

    /// Uses the configured chat `model` for embeddings too — Ollama has no
    /// separate embedding-model setting in this app yet. If the configured
    /// model doesn't support `/api/embed` this simply errors, and the caller
    /// (`ai::context::knowledge::embed_tables`) falls back to the keyword
    /// vector, so it degrades gracefully rather than failing the whole build.
    async fn embed(&self, texts: Vec<String>) -> Result<Vec<Vec<f32>>> {
        let url = format!("{}/api/embed", self.base_url.trim_end_matches('/'));
        let body = json!({ "model": self.model, "input": texts });
        let resp = http_client()?
            .post(&url)
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::AiError(format!("Embedding request failed (is Ollama running?): {e}")))?;
        if !resp.status().is_success() {
            return Err(error_from_response(resp).await);
        }

        let value: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| AppError::AiError(format!("Bad embeddings response: {e}")))?;
        let embeddings = value
            .get("embeddings")
            .and_then(|e| e.as_array())
            .ok_or_else(|| AppError::AiError("Ollama embeddings response missing 'embeddings'".to_string()))?;

        let mut out = Vec::with_capacity(embeddings.len());
        for emb in embeddings {
            let arr = emb
                .as_array()
                .ok_or_else(|| AppError::AiError("Malformed embedding vector".to_string()))?;
            out.push(arr.iter().filter_map(|v| v.as_f64()).map(|v| v as f32).collect());
        }
        Ok(out)
    }
}
