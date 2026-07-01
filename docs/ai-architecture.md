# ArrowLens — AI Layer Architecture

> Design reference for the AI features: **Explain Schema**, **Natural-Language → SQL**, **SQL Performance Advisor** (and future AI capabilities).
> Goal: let feature work focus on *prompts + UX*, because the plumbing (provider, context, validation, streaming, privacy) is solved once and shared.

---

## 1. Guiding principles

1. **AI is an orchestration layer, not a new engine.** Every feature composes primitives the app already has:
   - schema → `list_database_schema_tree`, `get_schema`, `DatasetSchema`
   - plans → `explain_query`
   - stats → `get_statistics`, `get_column_stats`
   - execution / dry-run → `run_query`
   The AI module *builds context from* and *acts through* these. It never re-implements introspection.

2. **LLM calls live in Rust, not the webview.** API keys never touch the renderer. The backend owns the provider abstraction, context building, validation, and streaming. This also keeps the door open for a local model (Ollama) with zero frontend change.

3. **Human-in-the-loop by default.** Generated SQL is *inserted into the editor*, never auto-executed. The advisor *suggests*, never mutates. This matches the app's local-first, no-surprise-side-effects ethos.

4. **Privacy is explicit.** Schema (and optionally sample rows) leaves the machine when a cloud provider is used. There is a consent gate, redaction, and a "local-only" provider option. AI is **opt-in**.

5. **Everything is cached by content hash.** Schema context, explanations, and advice are keyed by `(feature, schema_hash, input_hash)` so repeat calls are free and deterministic to debug.

---

## 2. High-level shape

```
┌──────────────────────────── React (MVVM) ────────────────────────────┐
│  views/QueryWorkspace ─┬─ features/ai-assistant/                      │
│                        │     useNlToSql · useExplainSchema            │
│                        │     usePerfAdvisor · components/AiPanel      │
│  state/aiStore  ◄──────┘                                              │
│  services/aiService  (invoke + event stream subscription)            │
└───────────────────────────────┬───────────────────────────────────────┘
                                 │  Tauri commands  +  ai://stream events
┌────────────────────────────────▼──────────────────────────────────────┐
│  api/ai_api.rs   (thin command handlers)                              │
│                                                                       │
│  ai/                                                                  │
│   ├ config.rs        AiConfig: provider, model, key ref, privacy      │
│   ├ provider/        LlmProvider trait → anthropic · openai · ollama  │
│   ├ context/         schema_context · sampler (redaction)             │
│   ├ prompt/          explain_schema · nl_to_sql · perf_advisor        │
│   ├ features/        one orchestrator per feature                     │
│   ├ validate.rs      read-only guard · dialect parse · EXPLAIN dry-run│
│   └ cache.rs         hash-keyed response cache                        │
│                                                                       │
│  reuses ► engine::{database_executor, schema_manager, query_planner}  │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 3. Backend modules (Rust)

```
src-tauri/src/ai/
  mod.rs
  config.rs
  provider/
    mod.rs          // LlmProvider trait + request/response/stream types
    anthropic.rs    // Claude (default)
    openai.rs       // optional
    ollama.rs       // local, no-egress option
  context/
    schema_context.rs   // compact, token-efficient schema snapshot
    sampler.rs          // optional sample rows + redaction
  prompt/
    mod.rs
    explain_schema.rs
    nl_to_sql.rs
    perf_advisor.rs
  features/
    explain_schema.rs
    nl_to_sql.rs
    perf_advisor.rs
  validate.rs
  cache.rs
src-tauri/src/api/ai_api.rs
```

### 3.1 Provider abstraction (`provider/mod.rs`)

```rust
#[async_trait]
pub trait LlmProvider: Send + Sync {
    async fn complete(&self, req: LlmRequest) -> Result<LlmResponse>;
    // Streaming variant emits token deltas through a channel.
    async fn stream(&self, req: LlmRequest, tx: mpsc::Sender<LlmDelta>) -> Result<LlmResponse>;
    fn id(&self) -> &'static str;          // "anthropic" | "openai" | "ollama"
}

pub struct LlmRequest {
    pub system: String,
    pub messages: Vec<LlmMessage>,
    pub max_tokens: u32,
    pub temperature: f32,
    pub stop: Vec<String>,
}
```

- **Default provider: Anthropic (Claude).** Recommended model tiers:
  - NL→SQL: `claude-sonnet-4-6` (or `claude-haiku-4-5` for speed/cost).
  - Explain schema: `claude-sonnet-4-6`.
  - Performance advisor: `claude-opus-4-8` or `claude-sonnet-4-6` (reasoning-heavy).
- HTTP via `reqwest` (add dependency). Streaming via SSE → forwarded as Tauri events.
- API key storage: **current implementation** persists the key in the app-data config file (`app_state.json`) via `AppStore`, and never returns it to the renderer (`AiConfigDto` exposes only `has_api_key`). **Planned hardening:** move the key to the OS keychain (`keyring` crate). The provider layer reads the key through one accessor, so this is a localized change.

### 3.2 Schema context builder (`context/schema_context.rs`) — *the most important piece*

Produces a compact, dialect-tagged snapshot that grounds every feature. This is the single biggest lever on output quality.

```rust
pub struct SchemaContext {
    pub dialect: String,                  // "postgres" | "mysql" | "sqlite" | "datafusion"
    pub tables: Vec<TableContext>,
    pub relationships: Vec<ForeignKey>,   // FK edges for join inference
    pub hash: String,                     // content hash → cache key
}
pub struct TableContext {
    pub name: String,
    pub columns: Vec<ColumnContext>,      // name, type, nullable, pk
    pub row_count: Option<u64>,           // from stats, hints scan cost
    pub indexes: Vec<IndexInfo>,
    pub sample_values: Option<Vec<Row>>,  // opt-in, redacted
}
```

Render to a **DDL-like text block** in the prompt (LLMs ground far better on `CREATE TABLE` than on JSON):

```
-- dialect: postgres
CREATE TABLE customer (
  customer_id INT PRIMARY KEY,
  store_id    INT NOT NULL,         -- FK → store.store_id
  email       VARCHAR,
  ...
);  -- ~599 rows
```

Token-budget strategy for large DBs: rank tables by relevance (mentioned in the question / FK-connected / largest), include full DDL for top-N, name-only for the rest.

### 3.3 Validation (`validate.rs`) — the safety + quality gate

Every generated statement passes through this before reaching the user:

1. **Parse** with `sqlparser` (matching the connection dialect). Reject unparseable output.
2. **Read-only guard** for NL→SQL: allow only `SELECT` / `WITH`. Reject `INSERT/UPDATE/DELETE/DROP/ALTER/...` unless the user explicitly enabled write mode.
3. **Dry-run** via `EXPLAIN` against the live connection (reuses `explain_query`) — proves the SQL is valid against the *actual* schema without executing it.
4. **Self-repair loop (max 1–2 iters):** on parse/EXPLAIN error, feed the error back to the model once. This single retry is the highest-ROI quality step in the whole pipeline.

### 3.4 Tauri commands (`api/ai_api.rs`)

| Command | In | Out |
|---|---|---|
| `ai_get_config` / `ai_set_config` | — / `AiConfig` | `AiConfig` |
| `ai_explain_schema` | `connection_id`, `scope` | streamed markdown |
| `ai_generate_sql` | `connection_id`, `question`, `options` | `{ sql, rationale, validation }` (streamed) |
| `ai_advise_performance` | `connection_id`, `sql` | `{ findings[], rewrites[], indexes[] }` |

Streaming convention: each call gets a `request_id`; deltas emit on event `ai://stream/{request_id}`, terminated by a `done`/`error` event. (Mirror the existing `run_query_streaming` pattern.)

Register all four in `lib.rs::invoke_handler` alongside the existing commands.

---

## 4. The three features as pipelines

### 4.1 Explain Schema
```
scope (db | schema | table)
  → SchemaContext (cached by schema_hash)
  → prompt/explain_schema  (purpose, entities, relationships, notable columns)
  → provider.stream → markdown rendered in AiPanel
```
Output: narrative overview + per-table summaries + an inferred relationship list (feeds a future ER-diagram view).

### 4.2 Natural-Language → SQL  *(the core agentic loop)*
```
NL question + SchemaContext + dialect
  → prompt/nl_to_sql → candidate SQL (streamed)
  → validate: parse → read-only guard → EXPLAIN dry-run
       ├─ ok    → return { sql, rationale }
       └─ error → self-repair (≤2) → re-validate
  → INSERT into editor (never auto-run); user reviews + runs via run_query
```

### 4.3 SQL Performance Advisor
```
SQL + EXPLAIN plan (explain_query) + SchemaContext (incl. indexes, row_counts)
  → prompt/perf_advisor
  → structured findings:
       • full scans / missing indexes (+ CREATE INDEX suggestion)
       • non-sargable predicates, implicit casts
       • join order / cardinality risks
       • SELECT * / over-fetch
       • suggested rewrite (must re-pass validate.rs)
```
Output is **structured JSON** (findings + suggested DDL/rewrites), rendered as an actionable checklist. Index suggestions are copy-to-clipboard, not auto-applied.

---

## 5. Frontend modules (TS / React MVVM)

```
src/
  models/ai.ts                      // AiConfig, SqlSuggestion, PerfFinding, stream types
  services/aiService.ts             // invokeCommand + listen("ai://stream/{id}")
  state/aiStore.ts                  // config, in-flight requests, stream buffers
  view-models/useAiAssistantViewModel.ts
  features/ai-assistant/
    index.ts
    useExplainSchema.ts
    useNlToSql.ts
    usePerfAdvisor.ts
    components/
      AiPanel.tsx                   // host panel (tab in QueryWorkspace / sidebar)
      SchemaExplanation.tsx
      NlSqlPrompt.tsx               // NL box → "Generate" → inserts into editor
      PerfAdvisorPanel.tsx          // findings checklist
      AiSettings.tsx                // provider, model, key, privacy toggles
```

Integration points (minimal disturbance):
- **NL→SQL**: a prompt bar above the existing CodeMirror editor in `QueryWorkspace`. Generated SQL flows into the active tab.
- **Explain Schema**: action on `SchemaTree` / `DatasetTree` nodes → opens `AiPanel`.
- **Perf Advisor**: button in `QueryToolbar` next to Explain → runs on current editor SQL.

`aiService.ts` mirrors `databaseService.ts` exactly (thin `invokeCommand` wrappers) plus an event-subscription helper for streaming.

---

## 6. Privacy & config (`AiConfig`)

```rust
pub struct AiConfig {
    pub enabled: bool,                 // master opt-in
    pub provider: String,              // "anthropic" | "openai" | "ollama"
    pub model: String,
    pub allow_sample_rows: bool,       // send sample data? default false
    pub redaction: RedactionMode,      // none | mask_pii | schema_only
    pub local_only: bool,              // hard-block any cloud egress
}
```
- Default: schema-only (no row data), cloud disabled until the user adds a key.
- `ollama` provider satisfies strict local-only / air-gapped users with no code change elsewhere.

---

## 7. Suggested build order

| Phase | Deliverable | Why first |
|---|---|---|
| 0 | `provider/` (Anthropic) + `config.rs` + keychain + `ai_get/set_config` | nothing works without a provider |
| 1 | `context/schema_context.rs` + DDL renderer + cache | the quality lever every feature shares |
| 2 | **Explain Schema** (read-only, no validation needed) | simplest end-to-end proof; exercises streaming + context |
| 3 | `validate.rs` + **NL→SQL** + self-repair | the flagship feature; needs phases 1–2 |
| 4 | **Performance Advisor** (reuses `explain_query`) | builds on validation + context |
| 5 | Ollama provider, redaction modes, ER-diagram from relationships | hardening + reach |

Start at Phase 2 for a visible win, with Phases 0–1 as its prerequisites.

---

## 8. New dependencies

- Rust: `reqwest` (HTTP/SSE), `sqlparser` (validation), `keyring` (key storage), `sha2` (cache hashing). `tokio`/`futures`/`async-trait`/`serde` already present.
- TS: none required — reuses `@tauri-apps/api` `invoke` + `event.listen`.
