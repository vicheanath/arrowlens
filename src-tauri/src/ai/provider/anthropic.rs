use async_trait::async_trait;
use serde_json::json;
use tokio::sync::mpsc::UnboundedSender;

use super::{error_from_response, for_each_line, http_client, LlmProvider, LlmRequest};
use crate::ai::config::AiConfig;
use crate::error::{AppError, Result};

const API_URL: &str = "https://api.anthropic.com/v1/messages";
const API_VERSION: &str = "2023-06-01";

/// Anthropic Claude provider (Messages API, SSE streaming).
pub struct AnthropicProvider {
    api_key: String,
    model: String,
    base_url: String,
}

impl AnthropicProvider {
    pub fn from_config(config: &AiConfig) -> Result<Self> {
        let api_key = config
            .api_key
            .clone()
            .filter(|k| !k.is_empty())
            .ok_or_else(|| AppError::AiNotConfigured("Anthropic API key is missing".to_string()))?;
        let base_url = config
            .base_url
            .clone()
            .filter(|u| !u.trim().is_empty())
            .unwrap_or_else(|| API_URL.to_string());
        Ok(Self { api_key, model: config.model.clone(), base_url })
    }
}

#[async_trait]
impl LlmProvider for AnthropicProvider {
    async fn stream(&self, req: LlmRequest, tx: UnboundedSender<String>) -> Result<String> {
        let messages: Vec<_> = req
            .messages
            .iter()
            .map(|m| json!({ "role": m.role, "content": m.content }))
            .collect();

        let body = json!({
            "model": self.model,
            "max_tokens": req.max_tokens,
            "temperature": req.temperature,
            "system": req.system,
            "messages": messages,
            "stream": true,
        });

        let resp = http_client()?
            .post(&self.base_url)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", API_VERSION)
            .header("content-type", "application/json")
            .json(&body)
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
            let value: serde_json::Value = match serde_json::from_str(data) {
                Ok(v) => v,
                Err(_) => return Ok(false),
            };
            match value.get("type").and_then(|t| t.as_str()) {
                Some("content_block_delta") => {
                    if let Some(text) = value
                        .get("delta")
                        .and_then(|d| d.get("text"))
                        .and_then(|t| t.as_str())
                    {
                        full.push_str(text);
                        let _ = tx.send(text.to_string());
                    }
                    Ok(false)
                }
                Some("message_stop") => Ok(true),
                Some("error") => {
                    let msg = value
                        .get("error")
                        .and_then(|e| e.get("message"))
                        .and_then(|m| m.as_str())
                        .unwrap_or("unknown streaming error");
                    Err(AppError::AiError(msg.to_string()))
                }
                _ => Ok(false),
            }
        })
        .await?;

        Ok(full)
    }
}
