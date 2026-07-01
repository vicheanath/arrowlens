use serde::{Deserialize, Serialize};

/// Which LLM backend to use. `Ollama` is a fully local, no-egress option.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AiProvider {
    Anthropic,
    Openai,
    Ollama,
}

impl Default for AiProvider {
    fn default() -> Self {
        AiProvider::Anthropic
    }
}

/// Persisted AI configuration. The API key is stored here for now; the
/// `provider` module reads it. A future hardening step can move the key into
/// the OS keychain without touching the rest of the AI layer.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiConfig {
    /// Master opt-in. AI is disabled until the user turns it on.
    pub enabled: bool,
    pub provider: AiProvider,
    pub model: String,
    /// Secret. Never sent back to the frontend (see `AiConfigDto`).
    #[serde(default)]
    pub api_key: Option<String>,
    /// Override endpoint, used for Ollama or OpenAI-compatible gateways.
    #[serde(default)]
    pub base_url: Option<String>,
    /// Whether sample rows may be included in the schema context sent to the
    /// provider. Defaults to false (schema-only) for privacy.
    #[serde(default)]
    pub allow_sample_rows: bool,
    /// Cap on how many tables are rendered in full DDL inside a prompt, to keep
    /// token usage bounded on large databases.
    #[serde(default = "default_max_tables")]
    pub max_tables: usize,
}

fn default_max_tables() -> usize {
    40
}

impl Default for AiConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            provider: AiProvider::Anthropic,
            model: default_model(AiProvider::Anthropic).to_string(),
            api_key: None,
            base_url: None,
            allow_sample_rows: false,
            max_tables: default_max_tables(),
        }
    }
}

impl AiConfig {
    pub fn is_ready(&self) -> bool {
        if !self.enabled {
            return false;
        }
        let has_key = self.api_key.as_deref().map(|k| !k.is_empty()).unwrap_or(false);
        let has_base_url = self.base_url.as_deref().map(|u| !u.trim().is_empty()).unwrap_or(false);
        match self.provider {
            // Local provider needs no key.
            AiProvider::Ollama => true,
            // A key, or a custom base URL (LM Studio / vLLM / llama.cpp / …).
            AiProvider::Openai => has_key || has_base_url,
            AiProvider::Anthropic => has_key,
        }
    }

    /// Sanitized view safe to return to the renderer (no secret material).
    pub fn to_dto(&self) -> AiConfigDto {
        AiConfigDto {
            enabled: self.enabled,
            provider: self.provider,
            model: self.model.clone(),
            base_url: self.base_url.clone(),
            allow_sample_rows: self.allow_sample_rows,
            max_tables: self.max_tables,
            has_api_key: self.api_key.as_deref().map(|k| !k.is_empty()).unwrap_or(false),
            ready: self.is_ready(),
        }
    }
}

/// Recommended default model per provider.
pub fn default_model(provider: AiProvider) -> &'static str {
    match provider {
        AiProvider::Anthropic => "claude-sonnet-4-6",
        AiProvider::Openai => "gpt-4o",
        AiProvider::Ollama => "llama3.1",
    }
}

/// Frontend-facing configuration update. `api_key` is optional: `None` leaves
/// the stored key untouched, `Some("")` clears it, `Some(key)` replaces it.
#[derive(Debug, Clone, Deserialize)]
pub struct AiConfigUpdate {
    pub enabled: Option<bool>,
    pub provider: Option<AiProvider>,
    pub model: Option<String>,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub allow_sample_rows: Option<bool>,
    pub max_tables: Option<usize>,
}

impl AiConfig {
    pub fn apply(&mut self, update: AiConfigUpdate) {
        if let Some(enabled) = update.enabled {
            self.enabled = enabled;
        }
        if let Some(provider) = update.provider {
            // When the provider changes and the model was left at the previous
            // provider's default, move it to the new provider's default.
            let was_default = self.model == default_model(self.provider);
            self.provider = provider;
            if was_default && update.model.is_none() {
                self.model = default_model(provider).to_string();
            }
        }
        if let Some(model) = update.model {
            if !model.trim().is_empty() {
                self.model = model;
            }
        }
        if let Some(api_key) = update.api_key {
            self.api_key = if api_key.is_empty() { None } else { Some(api_key) };
        }
        if let Some(base_url) = update.base_url {
            self.base_url = if base_url.trim().is_empty() { None } else { Some(base_url) };
        }
        if let Some(allow_sample_rows) = update.allow_sample_rows {
            self.allow_sample_rows = allow_sample_rows;
        }
        if let Some(max_tables) = update.max_tables {
            self.max_tables = max_tables.clamp(1, 200);
        }
    }
}

/// Secret-free configuration returned to the frontend.
#[derive(Debug, Clone, Serialize)]
pub struct AiConfigDto {
    pub enabled: bool,
    pub provider: AiProvider,
    pub model: String,
    pub base_url: Option<String>,
    pub allow_sample_rows: bool,
    pub max_tables: usize,
    pub has_api_key: bool,
    pub ready: bool,
}
