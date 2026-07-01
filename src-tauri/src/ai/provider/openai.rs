use async_trait::async_trait;
use serde_json::json;
use tokio::sync::mpsc::UnboundedSender;

use super::{error_from_response, for_each_line, http_client, LlmProvider, LlmRequest};
use crate::ai::config::AiConfig;
use crate::error::{AppError, Result};

const DEFAULT_BASE: &str = "https://api.openai.com/v1";

/// Resolve the chat-completions endpoint from a user-supplied base URL,
/// tolerating common shapes: a bare host (`http://localhost:1234`), a versioned
/// base (`.../v1`), or a full endpoint (`.../chat/completions`).
fn build_chat_url(base: &str) -> String {
    let trimmed = base.trim().trim_end_matches('/');
    if trimmed.ends_with("/chat/completions") {
        trimmed.to_string()
    } else if trimmed.ends_with("/v1") {
        format!("{trimmed}/chat/completions")
    } else {
        format!("{trimmed}/v1/chat/completions")
    }
}

/// Same URL-shape tolerance as `build_chat_url`, for the embeddings endpoint.
fn build_embeddings_url(base: &str) -> String {
    let trimmed = base.trim().trim_end_matches('/');
    if trimmed.ends_with("/embeddings") {
        trimmed.to_string()
    } else if trimmed.ends_with("/v1") {
        format!("{trimmed}/embeddings")
    } else {
        format!("{trimmed}/v1/embeddings")
    }
}

/// Fixed embedding model — separate from the chat `model` field (which may be
/// a non-embedding chat model). Small, cheap, and widely available; a custom
/// base URL (LM Studio/vLLM/etc.) is expected to route this the same way it
/// routes chat completions.
const EMBEDDING_MODEL: &str = "text-embedding-3-small";

/// OpenAI (and OpenAI-compatible) provider via the Chat Completions SSE stream.
///
/// The API key is optional: OpenAI-compatible local servers (LM Studio, vLLM,
/// llama.cpp, LiteLLM, …) accept requests without one. A key is only required
/// when talking to the hosted OpenAI endpoint.
pub struct OpenAiProvider {
    api_key: Option<String>,
    model: String,
    base_url: String,
}

impl OpenAiProvider {
    pub fn from_config(config: &AiConfig) -> Result<Self> {
        let base_url = config
            .base_url
            .clone()
            .filter(|u| !u.trim().is_empty())
            .unwrap_or_else(|| DEFAULT_BASE.to_string());
        let api_key = config.api_key.clone().filter(|k| !k.is_empty());

        // Require a key only when using the hosted OpenAI endpoint.
        let is_custom_endpoint = config
            .base_url
            .as_deref()
            .map(|u| !u.trim().is_empty())
            .unwrap_or(false);
        if api_key.is_none() && !is_custom_endpoint {
            return Err(AppError::AiNotConfigured(
                "OpenAI API key is missing (or set a Base URL for a local OpenAI-compatible server)"
                    .to_string(),
            ));
        }

        Ok(Self { api_key, model: config.model.clone(), base_url })
    }
}

#[async_trait]
impl LlmProvider for OpenAiProvider {
    async fn stream(&self, req: LlmRequest, tx: UnboundedSender<String>) -> Result<String> {
        let mut messages = vec![json!({ "role": "system", "content": req.system })];
        for m in &req.messages {
            messages.push(json!({ "role": m.role, "content": m.content }));
        }

        let body = json!({
            "model": self.model,
            "max_tokens": req.max_tokens,
            "temperature": req.temperature,
            "messages": messages,
            "stream": true,
        });

        let url = build_chat_url(&self.base_url);
        let mut request = http_client()?
            .post(&url)
            .header("content-type", "application/json")
            .json(&body);
        if let Some(key) = &self.api_key {
            request = request.header("authorization", format!("Bearer {}", key));
        }
        let resp = request
            .send()
            .await
            .map_err(|e| AppError::AiError(format!("Request failed: {e}")))?;

        if !resp.status().is_success() {
            return Err(error_from_response(resp).await);
        }

        let mut full = String::new();
        for_each_line(resp, |line| {
            let Some(data) = line.strip_prefix("data:") else {
                return Ok(false);
            };
            let data = data.trim();
            if data.is_empty() {
                return Ok(false);
            }
            if data == "[DONE]" {
                return Ok(true);
            }
            let value: serde_json::Value = match serde_json::from_str(data) {
                Ok(v) => v,
                Err(_) => return Ok(false),
            };
            if let Some(text) = value
                .get("choices")
                .and_then(|c| c.get(0))
                .and_then(|c| c.get("delta"))
                .and_then(|d| d.get("content"))
                .and_then(|t| t.as_str())
            {
                full.push_str(text);
                let _ = tx.send(text.to_string());
            }
            Ok(false)
        })
        .await?;

        Ok(full)
    }

    async fn embed(&self, texts: Vec<String>) -> Result<Vec<Vec<f32>>> {
        let body = json!({ "model": EMBEDDING_MODEL, "input": texts });
        let url = build_embeddings_url(&self.base_url);
        let mut request = http_client()?.post(&url).header("content-type", "application/json").json(&body);
        if let Some(key) = &self.api_key {
            request = request.header("authorization", format!("Bearer {}", key));
        }
        let resp = request
            .send()
            .await
            .map_err(|e| AppError::AiError(format!("Embedding request failed: {e}")))?;
        if !resp.status().is_success() {
            return Err(error_from_response(resp).await);
        }

        let value: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| AppError::AiError(format!("Bad embeddings response: {e}")))?;
        let data = value
            .get("data")
            .and_then(|d| d.as_array())
            .ok_or_else(|| AppError::AiError("Embeddings response missing 'data'".to_string()))?;

        let mut out = Vec::with_capacity(data.len());
        for item in data {
            let emb = item
                .get("embedding")
                .and_then(|e| e.as_array())
                .ok_or_else(|| AppError::AiError("Embedding item missing 'embedding'".to_string()))?;
            out.push(emb.iter().filter_map(|v| v.as_f64()).map(|v| v as f32).collect());
        }
        Ok(out)
    }
}
