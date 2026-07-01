pub mod anthropic;
pub mod ollama;
pub mod openai;

use async_trait::async_trait;
use futures::StreamExt;
use tokio::sync::mpsc::UnboundedSender;

use crate::ai::config::{AiConfig, AiProvider};
use crate::error::{AppError, Result};

/// A single chat message. `role` is "user" or "assistant".
#[derive(Debug, Clone)]
pub struct LlmMessage {
    pub role: String,
    pub content: String,
}

impl LlmMessage {
    pub fn user(content: impl Into<String>) -> Self {
        Self { role: "user".to_string(), content: content.into() }
    }
    pub fn assistant(content: impl Into<String>) -> Self {
        Self { role: "assistant".to_string(), content: content.into() }
    }
}

/// Provider-agnostic completion request.
#[derive(Debug, Clone)]
pub struct LlmRequest {
    pub system: String,
    pub messages: Vec<LlmMessage>,
    pub max_tokens: u32,
    pub temperature: f32,
}

impl LlmRequest {
    pub fn new(system: impl Into<String>, user: impl Into<String>) -> Self {
        Self {
            system: system.into(),
            messages: vec![LlmMessage::user(user)],
            max_tokens: 2048,
            temperature: 0.0,
        }
    }

    pub fn with_max_tokens(mut self, max_tokens: u32) -> Self {
        self.max_tokens = max_tokens;
        self
    }
}

/// A streaming LLM backend. Implementors only need `stream`; `complete` drains
/// the stream into a single string.
#[async_trait]
pub trait LlmProvider: Send + Sync {
    /// Stream the completion, sending text deltas through `tx` as they arrive.
    /// Returns the full accumulated text when finished.
    async fn stream(&self, req: LlmRequest, tx: UnboundedSender<String>) -> Result<String>;

    /// Non-streaming convenience: collect the whole completion.
    async fn complete(&self, req: LlmRequest) -> Result<String> {
        // The receiver is held alive for the duration of the call; deltas are
        // buffered but ignored — we only want the final accumulated text.
        let (tx, _rx) = tokio::sync::mpsc::unbounded_channel();
        self.stream(req, tx).await
    }

    /// Embed a batch of texts into vectors for semantic (cosine) retrieval, one
    /// vector per input text in the same order. Optional: not every provider
    /// has an embeddings API — Anthropic notably doesn't — so the default
    /// reports unsupported and callers fall back to a keyword-hash vector
    /// (see `ai::context::knowledge::embed_tables`).
    async fn embed(&self, _texts: Vec<String>) -> Result<Vec<Vec<f32>>> {
        Err(AppError::AiError("embeddings are not supported by this provider".to_string()))
    }
}

/// Build a provider instance from the active configuration.
pub fn build_provider(config: &AiConfig) -> Result<Box<dyn LlmProvider>> {
    if !config.enabled {
        return Err(AppError::AiNotConfigured("AI is disabled".to_string()));
    }
    match config.provider {
        AiProvider::Anthropic => Ok(Box::new(anthropic::AnthropicProvider::from_config(config)?)),
        AiProvider::Openai => Ok(Box::new(openai::OpenAiProvider::from_config(config)?)),
        AiProvider::Ollama => Ok(Box::new(ollama::OllamaProvider::from_config(config)?)),
    }
}

pub(crate) fn http_client() -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .build()
        .map_err(|e| AppError::AiError(format!("Failed to build HTTP client: {e}")))
}

/// Read a streaming response body line by line, invoking `handle` for each
/// complete line. `handle` returns `Ok(true)` to stop early (e.g. on a
/// sentinel). Lines are UTF-8; partial lines are buffered across chunks.
pub(crate) async fn for_each_line<F>(resp: reqwest::Response, mut handle: F) -> Result<()>
where
    F: FnMut(&str) -> Result<bool>,
{
    let mut stream = resp.bytes_stream();
    let mut buf: Vec<u8> = Vec::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| AppError::AiError(format!("Stream read error: {e}")))?;
        buf.extend_from_slice(&chunk);

        // Drain complete lines from the buffer.
        while let Some(pos) = buf.iter().position(|&b| b == b'\n') {
            let line_bytes: Vec<u8> = buf.drain(..=pos).collect();
            let line = String::from_utf8_lossy(&line_bytes);
            let line = line.trim_end_matches(['\r', '\n']);
            if handle(line)? {
                return Ok(());
            }
        }
    }

    // Flush any trailing partial line.
    if !buf.is_empty() {
        let line = String::from_utf8_lossy(&buf);
        handle(line.trim())?;
    }
    Ok(())
}

/// Turn a non-success HTTP response into a structured AI error.
pub(crate) async fn error_from_response(resp: reqwest::Response) -> AppError {
    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();
    let detail = if body.is_empty() { status.to_string() } else { format!("{status}: {body}") };
    AppError::AiError(detail)
}
