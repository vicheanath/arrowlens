# Feature Roadmap for the Data-Developer Persona

*Prepared by Head of Product, ArrowLens · 2026-06-29*

---

## 1. Executive Summary

ArrowLens today is a **fast, local-first, Arrow-native SQL workspace** with an unusually strong query-authoring core (CodeMirror editor, multi-tab sessions, streaming execution, EXPLAIN visualization), a credible multi-engine backend (DataFusion for files + sqlx for SQLite/MySQL/Postgres), and a privacy-first, provider-agnostic AI layer (Anthropic/OpenAI/Ollama) that already ships NL→SQL with self-repair, schema explanation, and a performance advisor. That is a genuinely differentiated foundation.

Measured against the reference set for this persona — **DataGrip, DBeaver, TablePlus, Beekeeper, pgAdmin, and the DuckDB UI** — ArrowLens reaches parity on the editor surface but trails on the workflows a data developer lives in once they connect to a *real* database: inspecting structure without writing SQL, browsing and editing data safely, moving data in and out, and not leaking credentials. Several advertised capabilities are also **correctness traps** rather than mere gaps: the 10k-row clip silently truncates results and exports, DB "streaming" actually `fetch_all`s into memory first, and Parquet export round-trips through CSV (destroying types).

Beyond features, ArrowLens has not yet built the **product floor that makes a desktop tool installable and trustworthy at all**: there is no auto-update path, no code-signing/notarization in the release pipeline (Gatekeeper/SmartScreen will block real installs), **zero automated tests and no PR-level CI**, no accessibility or internationalization story for a custom virtualized grid, no global settings/onboarding/theme/window-state shell, and several **repo-level security hygiene** problems (a live-looking Postgres DSN committed in `AGENT.md`, `app.security.csp = null`, broad `:default` Tauri permission scopes, no dependency/SBOM audit). These are not "nice-to-haves" — they are the difference between a demo and a product an enterprise can procure, and they are weighted accordingly below.

**The 5 biggest *feature* gaps, in priority order:**

1. **Secrets in plaintext.** Connection strings (with passwords) and LLM API keys are written to `app_state.json` in cleartext. This blocks any team/enterprise adoption and is the single highest-risk gap. → OS keychain + DSN splitting. *(Paired with repo-level secret hygiene — see §3 Security.)*
2. **No database object inspector / DDL viewer.** The connections tree stops at table name; you must `SELECT *` just to see a table's shape. Every incumbent opens columns/keys/indexes/DDL on click — and views, materialized views, functions, procedures, triggers, sequences, and custom types as first-class nodes. ArrowLens *already introspects* much of this for AI context — it's just not surfaced.
3. **Read/explore-only data plane.** Cell edits are UI-only, there is no write-back, no INSERT/UPDATE/DELETE-with-affected-rows, no transaction control, no data import beyond a bare file-open, and no "load into a table." The app cannot participate in real pipelines.
4. **Silent truncation & lossy export.** 10k-row clip on execute *and* export, fake DB streaming (`fetch_all`), and CSV-roundtrip Parquet undermine trust on exactly the large/typed data this persona cares about.
5. **No clipboard/file collaboration loop.** Single-cell-only copy, no "copy as TSV/INSERT/Markdown," no open/save `.sql` files. SQL is trapped in the app, so it can't be git-versioned, reviewed, or shared.

The strategy below fixes the trust-and-safety floor first (keychain, real streaming, object inspector, safe-mode) **and the distribution/quality floor in parallel** (signing + auto-update, a first test suite + PR CI, repo secret hygiene), then unlocks the data plane (edit/import/export/load), then leans into the three places ArrowLens can *beat* incumbents rather than just match them: **out-of-core DataFusion analytics, deep AI-in-the-loop workflows, and an Arrow-native data interchange story.**

---

## 2. What You Already Have (strengths to build on)

**SQL authoring (strong):** CodeMirror editor with dialect-aware highlighting/folding/bracket-matching; multi-tab sessions; run-full / run-selection / streaming execution with in-flight cancellation; multi-statement scripts with per-statement results; query history (200) + saved queries (name/tag/search); schema-aware autocomplete; EXPLAIN plan visualization (tree/plan/text, cost bars, hot-op filter); command palette; keyboard shortcuts.

**Engine & data sources (strong):** trait-based file loaders (CSV/Parquet/JSON/Arrow) via DataFusion+Arrow; DataFusion `QueryEngine`; pooled sqlx connections for SQLite/MySQL/Postgres; `DatabaseExecutor` with per-dialect cell serialization; streaming `RecordBatch` delivery over Tauri events; `ACTIVE_QUERIES` cancellation state machine; `SchemaManager` type formatting; `StatisticsEngine` (null/distinct/min/max/mean); structured `AppError`.

**Results, viz & export (solid core):** virtualized grid with sort/filter/inline-edit; column type detection + alignment; chart builder (bar/line/scatter/pie, agg, top-N); CSV/NDJSON/Parquet export; multi-statement result blocks.

**AI (differentiated):** provider abstraction (Anthropic/OpenAI/Ollama, streaming); schema-context builder with FKs + stable hash; sqlparser-based read-only validation + NL→SQL self-repair; performance advisor; in-memory response cache; privacy-first defaults (`allow_sample_rows=false`, API key never sent to frontend).

**App shell:** Tauri 2 with dialog/fs/shell plugins; atomic `AppStore` JSON persistence; restores connections + AI config on startup. A bundled `sqlite-sakila.db` sample database ships in-repo (not yet surfaced as guided first-run). `next-themes` is a dependency (not yet wired to a user-facing theme control).

**Latent assets worth exploiting:** the AI `schema_context.rs` already extracts **columns, types, FKs, constraints, and row estimates** per dialect — that powers the object inspector, DDL viewer, FK navigation, and index inspector with little new backend work. The sqlparser validator already classifies read-only vs. write — that powers safe-mode and destructive-write confirmation.

---

## 3. Gap Analysis by Domain

*De-duplicated across domains (several features — keychain, variables, copy-as, profiling, streaming export, statement timeout — appeared in multiple input sections and are listed once in their primary home).*

### Security, governance & secrets
| Feature | Have | Priority | Effort | Builds on |
|---|---|---|---|---|
| OS keychain credential storage (DB + API keys) | no | table-stakes | M | `AppStore`, `DatabaseConnectionInfo`, `AiConfig` + `keyring` crate |
| Separate secret from connection metadata (DSN split) | no | high | M | `normalize_connection_string`, sqlx connect-options builders |
| Redacted display & logging of secrets | no | table-stakes | S | `DatabaseConnectionInfo` display, `AppError::DB`, env_logger |
| **Remove committed DSN from `AGENT.md` + secret-scanning CI gate** | no | table-stakes | S | `AGENT.md` (live `postgresql://postgres:postgres@…` present), gitleaks/trufflehog in CI |
| **Define a Content Security Policy (`app.security.csp` is `null`)** | no | table-stakes | S | `tauri.conf.json`, react-markdown/AI render surface |
| **Least-privilege Tauri capability scoping (narrow `fs`/`shell`/`dialog` `:default`)** | no | high | M | `capabilities/default.json` (single broad capability file today) |
| Per-connection read-only / safe mode | partial | table-stakes | M | `validate_read_only_sql` (reuse), `ExecutorFactory` dispatch |
| Confirmation gate for destructive/DDL writes | no | high | M | sqlparser classification in `validate.rs`, `QueryToolbar` |
| Configurable row/result limits (auto-LIMIT + indicator) | partial | high | S | existing 10k clip, `QueryToolbar` metrics area |
| Per-query/per-connection statement timeout | no | high | M | `ACTIVE_QUERIES`, pool options, `DatabaseConnectionInfo` |
| Audit log of executed queries (durable, append-only) | partial | high | M | `HISTORY` + `record_history`, `AppStore` / local SQLite |
| **Dependency/license audit + SBOM (`cargo-audit`/`cargo-deny`/`npm audit`)** | no | high | S | CI pipeline (none today), enterprise-procurement narrative |
| Per-connection environment label (prod/dev) + banner | no | nice | S | `DatabaseConnectionInfo`, source indicator |
| Master-password encryption-at-rest fallback | no | nice | M | `AppStore` atomic write + argon2/aes-gcm |

### Cross-platform packaging, distribution & updates *(new domain)*
| Feature | Have | Priority | Effort | Builds on |
|---|---|---|---|---|
| Auto-update (delta artifacts + signed manifest) | no | table-stakes | M | `tauri-plugin-updater` (absent), `tauri.conf.json` `updater` block, release.yml artifact + keypair gen |
| macOS code signing + notarization | no | table-stakes | M | `release.yml` tauri-action (no `APPLE_ID`/`APPLE_CERTIFICATE` secrets today) |
| Windows Authenticode signing | no | table-stakes | M | `release.yml` (no Windows cert today); removes SmartScreen block |
| Per-platform installer config (MSI/NSIS, DMG styling+license, AppImage/deb/rpm, min-OS metadata) | partial | high | M | `bundle.targets` is blanket `"all"` today |
| In-app version-check / "update available" prompt + changelog | no | high | S | updater plugin events, settings shell |
| Global crash reporting / panic hook (opt-in) | no | high | M | `std::panic::set_hook` (none), optional telemetry; logging-only today |

### Testing, CI & release engineering *(new domain)*
| Feature | Have | Priority | Effort | Builds on |
|---|---|---|---|---|
| PR-level CI (build + lint + typecheck + test) | no | table-stakes | S | only `release.yml` (tag-triggered) exists; add `ci.yml` on push/PR |
| Rust unit tests for cell serialization (golden/fixture) | no | table-stakes | M | `pg_cell_to_json`, SQLite/MySQL serializers (zero `#[test]` in `src-tauri/src`) |
| Regression tests for the flagged correctness traps | no | table-stakes | M | streaming (`fetch_all`→stream), Arrow→Parquet, 10k clip — lock in fixes |
| Frontend unit/component tests | no | high | M | add vitest + testing-library (none in `package.json`) |
| E2E smoke tests (connect → query → export) | no | high | M | Playwright/WebdriverIO + Tauri driver |
| Type-fidelity property tests across dialects | no | high | M | `SchemaManager`, serializers, Arrow round-trip |
| Dialect parity test matrix (SQLite/MySQL/Postgres/DataFusion) | no | nice | M | `ExecutorFactory`, shared assertion harness |

### Accessibility & internationalization *(new domain)*
| Feature | Have | Priority | Effort | Builds on |
|---|---|---|---|---|
| Accessible data grid (ARIA grid roles, row/col semantics, SR announcements) | no | table-stakes | L | `VirtualTable` (react-window; virtualized grids are inaccessible by default) |
| Keyboard operability audit (focus order, modal focus-trap, visible focus rings, consistent Esc-to-close) | partial | high | M | shadcn Dialog/Sheet, command palette, grid focus mgmt |
| High-contrast / reduced-motion / font-scaling support | no | high | M | theme tokens, CSS `prefers-*` media queries |
| Internationalization (i18n framework, externalized strings) | no | high | M | hardcoded strings today; add i18n lib |
| Locale-aware number/date/decimal formatting (display + import, e.g. EU decimal comma) | partial | high | M | `VirtualTable` cell render, CSV loader, profile panel |

### App settings, preferences & onboarding (app-shell UX) *(new domain)*
| Feature | Have | Priority | Effort | Builds on |
|---|---|---|---|---|
| Global Settings/Preferences surface (host for row limits, timeouts, memory cap, CSV dialect, formatter, default export, safe-mode defaults) | partial | table-stakes | M | only `AiSettings.tsx` exists; needs a settings architecture |
| Light/dark theme toggle (wire `next-themes`) | partial | high | S | `next-themes` is a dep but no `ThemeProvider`/`useTheme`; app is dark-only |
| First-run onboarding / empty-state / sample-dataset launch | no | high | M | bundled `sqlite-sakila.db`, connections panel |
| Window-state persistence (size/position/layout) | no | high | S | `tauri-plugin-window-state` (absent) |
| Single-instance + "open with" / file-association handling | no | nice | M | `tauri-plugin-single-instance`, `.sql` open/save |
| Multi-window / detach result to window | no | nice | L | query tab model, window mgmt |

### Schema & data exploration / navigation
| Feature | Have | Priority | Effort | Builds on |
|---|---|---|---|---|
| DB object browser with column-level expansion | partial | table-stakes | M | `ConnectionsList`, `list_schema_tree`, `schema_context.rs` |
| Object inspector (columns, types, keys, indexes, DDL tabs) | partial | table-stakes | M | `schema_context.rs` introspection, schema tree UI |
| **Distinct tree nodes for views / materialized views / functions / procedures / triggers / sequences / custom & enum types** | no | table-stakes | M | introspection query currently lumps BASE TABLE/VIEW/FOREIGN; per-dialect catalog SELECTs |
| DDL / CREATE statement viewer | no | table-stakes | M | `schema_context.rs` renderer, `sqlite_master.sql` |
| One-click table data viewer (paged table tab) | partial | table-stakes | M | `VirtualTable`, `onTableQuery`, streaming executor |
| Index & constraint inspector | no | high | M | per-dialect introspection patterns in `schema_context.rs` |
| Object context menu (copy name, gen SELECT/INSERT, count, DDL) | partial | high | S | `context-menu.tsx`, `sqlTemplateService` |
| Global schema search (objects + columns) into Cmd+K | no | high | M | Command Palette + cached schema tree |
| Foreign-key click-through navigation | no | high | M | FK extraction in `schema_context.rs`, table viewer |
| Single-row detail (record) view | no | high | S | `VirtualTable` selection + shadcn Sheet |
| Lazy / on-demand schema tree loading | no | high | M | `list_schema_tree` → `list_columns(table)` per-node |
| Schema snapshot caching & refresh | no | nice | M | `MetadataCache`, AppStore, AI stable schema hash |
| Data dictionary / comments display | no | nice | S | extend column introspection SELECTs + tooltips |
| ER diagram | no | nice | L | introspected FK graph + new SVG graph layer |

### Database administration & DevOps
| Feature | Have | Priority | Effort | Builds on |
|---|---|---|---|---|
| Transaction control (BEGIN/COMMIT/ROLLBACK, pinned conn) | no | table-stakes | L | `DatabaseExecutor`, pinned-connection per tab |
| DDL/write execution returning affected-row counts | partial | table-stakes | M | `DatabaseExecutor.execute` (currently fetch_all-only) |
| Connection SSL/TLS configuration | no | table-stakes | M | `NewConnectionForm`, `PgPoolOptions`, sqlx TLS features |
| Structured connection editor (host/port/user) + edit/test | partial | high | M | `NewConnectionForm`, `validate_connection_string` |
| Run .sql script files (load + batch + stop-on-error) | partial | high | M | `run_query_multi`, `split_sql_statements`, fs/dialog |
| SSH tunnel for connections | no | high | L | `DatabaseRegistry` connect path + russh/thrussh |
| Server-side session & active-query management (kill) | partial | high | M | `active_queries.rs`, `pg_stat_activity`/PROCESSLIST |
| User / role / permission browser | no | nice | M | `DatabaseExecutor` catalog queries |
| Schema migration runner (versioned up/down) | no | nice | L | script-file + transaction features, `AppStore` |
| Visual DDL editing (create/alter/drop with preview) | no | nice | L | object inspector + write execution + txn control |

### Data import / export / interchange
| Feature | Have | Priority | Effort | Builds on |
|---|---|---|---|---|
| Streaming / full-result export (beyond 10k clip) | partial | table-stakes | M | `execute_streaming`, `stream_to_frontend`, Arrow writers |
| Direct Arrow→Parquet writer (drop temp-CSV) | partial | high | S | parquet `ArrowWriter`, streaming RecordBatch source |
| CSV/JSON/Parquet import wizard (delimiter/encoding/types) | partial | table-stakes | M | `loaders/*`, `LoaderPreview`, wizard modal like ExportModal |
| Copy result selection as TSV/CSV (range copy) | partial | table-stakes | M | `VirtualTable` selection, clipboard, `cellToString` |
| Copy results as JSON / Markdown table | no | high | S | NDJSON serializer, `cellToString`, clipboard |
| Copy results as INSERT statements | no | high | M | dialect quoting utils, value-literal formatter |
| Configurable CSV export dialect (delimiter/BOM/null) | no | high | S | `export_as_csv`, `ExportModal`, arrow-csv writer |
| Excel (.xlsx) import | no | high | M | new `ExcelLoader` (calamine), `FileType` enum |
| Excel (.xlsx) export | no | high | M | `ExportFormat` enum, `rust_xlsxwriter` |
| Generate CREATE TABLE DDL + INSERT script for dataset/table | no | high | M | `SchemaManager`, type-mapping layer, dialect quoting |
| Bulk insert / load results into a connected DB table | no | high | L | `DatabaseExecutor` (sqlx), batched INSERT/COPY |
| **Engine-native bulk path (Postgres `COPY` protocol vs batched INSERT)** | no | high | M | sqlx `COPY` support, dialect-specific load route |
| **Pandas/Polars/Arrow-feather interop ("open result in notebook"/DataFrame)** | no | high | M | Arrow IPC export, `serialize_batches`, file handoff |
| Export current selection / filtered view | no | nice | M | `VirtualTable` sortedRows + filter, range selection |
| Paste-to-table (clipboard → dataset) | no | nice | M | csv_loader on in-memory buffer, `DatasetRegistry` |
| DuckDB round-trip / Parquet folder source | no | nice | L | DataFusion Parquet read, new duckdb-rs connector |

### SQL authoring & productivity
| Feature | Have | Priority | Effort | Builds on |
|---|---|---|---|---|
| Context-aware autocomplete (alias/JOIN/scope-aware) | partial | table-stakes | L | `buildCompletionSchema` + custom completionSource parsing aliases/CTEs |
| Real SQL formatter (indentation + alignment, dialect-aware) | partial | table-stakes | M | replace `formatSql()` with sql-formatter / sqlparser pretty-printer |
| Find & replace in editor (regex, in-selection) | partial | table-stakes | S | `@codemirror/search` extension |
| SQL linting / inline diagnostics | no | high | M | sqlparser validate (already used by AI) + `@codemirror/lint` |
| Run statement under cursor | partial | high | M | `run_query_multi` splitter + cursor offset mapping |
| Query variables / parameters / macro substitution | no | high | M | pre-dispatch substitution pass, dialect quoting, `queryStore` |
| User snippet library (parameterized, tab-stops) | partial | high | M | `SqlTemplate` service, CodeMirror `snippet()`, `usePersistentState` |
| Favorites/bookmarks with folders & tags | partial | high | S | `SavedQueriesPanel` + favorite/folder fields, AppStore |
| Fuzzy command palette over all queries & objects | partial | high | M | `CommandPalette` (shadcn fuzzy) fed full history + schema |
| Per-tab persistence & autosave / version history | no | high | M | `queryStore` → AppStore persistence + capped snapshots |
| Comment toggling & keyword case transform | no | nice | S | `@codemirror/commands` toggleComment |
| Multi-cursor / select-next-occurrence | yes | nice | S | basicSetup already enables multi-selection; add keymap |

### Visualization & analysis
| Feature | Have | Priority | Effort | Builds on |
|---|---|---|---|---|
| Series / group-by (split-by) dimension in chart builder | no | table-stakes | M | `ChartBuilder` X/Y, `aggregateData`, color palette |
| Expanded chart library (stacked/grouped/area/heatmap/box) | partial | table-stakes | M | `ChartCanvas`/`chartTypes.ts`, recharts |
| Column profiling / distribution panel (surface existing stats) | partial | table-stakes | M | `StatisticsEngine`, `statsService`, `VirtualTable` header |
| Summary/overview stats strip on every result | partial | high | S | `StatisticsEngine`, `QueryResultPanel` toolbar |
| Per-column number/date formatting (+ fix epoch dates) | no | high | M | `VirtualTable` cell rendering, cell serialization |
| Time-series aware charting (temporal axis + bucketing) | no | high | M | type detection, `ChartCanvas`, DataFusion `date_trunc` |
| Value frequency / top-values per column | no | high | M | `QueryEngine`/`DatabaseExecutor`, column headers |
| Histograms / numeric binning | no | high | M | `StatisticsEngine` min/max, `ChartCanvas` bars |
| Quick group-by aggregation builder (no-SQL pivot) | partial | high | M | `aggregateData`, `QueryEngine`, `VirtualTable` |
| Pivot table (rows × cols × measure) | no | high | L | pivot SQL generation, `VirtualTable` |
| Saved / persisted visualizations | no | high | M | Saved Queries persistence, `ChartBuilder` config |
| Chart export / copy (PNG/SVG) + chart-data export | no | nice | S | recharts SVG output, Export dialog |
| Dashboards / notebook surface | no | nice | L | saved viz, query tabs, DataFusion temp views *(see Notebooks domain)* |

### Notebooks, scheduling & reproducibility *(new domain)*
| Feature | Have | Priority | Effort | Builds on |
|---|---|---|---|---|
| Multi-cell notebook surface with cell-to-cell data passing (temp views / CTE chaining) | no | high | L | DataFusion temp views, `DatasetRegistry`, query tabs |
| Query/result provenance & reproducibility (connection + schema version + param values captured with result) | no | high | M | `HISTORY`, schema stable-hash, variable substitution |
| Scheduled / recurring query execution ("extract on a schedule" → file) | no | nice | L | headless/CLI core, OS scheduler integration |
| External-tool interop (export to DataFrame/feather for ML) | no | high | M | *(unified with Import/Export "Pandas/Polars interop")* |

### Query performance & diagnostics
| Feature | Have | Priority | Effort | Builds on |
|---|---|---|---|---|
| EXPLAIN capture + EXPLAIN ANALYZE across engines | yes | table-stakes | S | `explain_query`, `build_postgres_explain_sql` |
| Hot-operator highlighting & cost ranking | yes | table-stakes | S | `costPercent`, hot-ops filter (already present) |
| Graphical plan tree / node-link visualization | partial | high | M | `parseExplainPlan` parent/child → SVG node-link |
| Row estimate vs actual divergence detection | partial | high | S | `ExplainDetails` estimated/actual → ranked badges |
| Query timing breakdown (planning vs exec vs self-time) | partial | high | M | `extractPgTimings`, `node.actualTime` → self-time |
| Buffers / I/O accounting (hit vs read, temp spills) | no | high | M | BUFFERS already requested; add parser to `parsePgCosts` |
| Sargability / anti-pattern linting on operators | partial | high | M | operator classification + sqlparser AST rule engine |
| Index advisor / missing-index suggestions (CREATE INDEX) | partial | high | M | AI perf advisor → structured recs, optional HypoPG |
| Slow-query tracking / history with timing trends | partial | high | M | persisted `HISTORY` + fingerprint grouping |
| Plan diffing (before/after) | no | high | L | structured `ExplainNode` trees + tree-match diff |
| DataFusion physical-plan diagnostics (pushdown/partitions) | partial | nice | M | EXPLAIN VERBOSE + ANALYZE metrics parse |

### Data quality, testing & validation
| Feature | Have | Priority | Effort | Builds on |
|---|---|---|---|---|
| Column profiling / data profile panel (strings/dates/freq) | partial | table-stakes | M | `StatisticsEngine` + extended SQL aggregates + UI panel |
| Null / blank / completeness detection in grid | partial | table-stakes | S | `VirtualTable` rendering, `null_count`, column predicate |
| Duplicate row & duplicate-key detection | no | table-stakes | M | distinct vs row count, generated GROUP BY/HAVING |
| Outlier / anomaly detection (IQR, percentiles) | no | high | M | `StatisticsEngine` + APPROX_PERCENTILE/STDDEV |
| Data assertions / inline tests (dbt-test style) | no | high | L | sqlparser validate, Saved-Queries persistence, multi-stmt runner |
| Constraint discovery & validation (orphan FK, null, dup) | partial | high | M | `schema_context.rs` FKs + anti-join validation queries |
| Row-level data diff between two tables/queries | no | high | L | DataFusion multi-dataset JOIN, `VirtualTable` highlight |
| Schema compare / diff between two sources | no | high | M | `DatasetSchema`/`list_schema_tree` normalized fields |
| PII / sensitive-data detection | no | nice | M | sampling + regex classifiers; optional AI w/ privacy toggle |
| Data masking / anonymization on export | no | nice | M | export pipeline injection point + PII detection |
| Format / pattern validation per column | no | nice | M | dialect regex (`regexp_match`/`~`/REGEXP), profile panel |

### Large-data scalability & UX
| Feature | Have | Priority | Effort | Builds on |
|---|---|---|---|---|
| True server-side streaming for SQL DBs (cursor/fetch) | partial | table-stakes | M | swap `fetch_all` → `sqlx::query().fetch(&pool)` Stream |
| Keyset/offset pagination ('load next page' vs 10k clip) | no | table-stakes | M | `QueryResult` serializer, `run_query`, offset/limit params |
| Push-down sort & filter to source engine | partial | high | M | `VirtualTable` sort/filter, DataFusion `.sort()/.filter()` |
| DataFusion memory limit + spill-to-disk | no | high | M | `build_context` → `RuntimeEnvBuilder` memory pool |
| Partitioned / multi-file dataset (directory & glob) | no | high | L | DataFusion `ListingTable`, `register_dataset_in_ctx` |
| Bounded result buffer with windowed grid | no | high | M | `queryStore` onChunk accumulation cap |
| Promptly responsive cancellation (mid-batch, server-side) | partial | high | M | `active_queries`, sqlx handles, server-side cancel |
| Lazy schema tree loading | no | high | M | *(see Exploration domain)* |
| Determinate progress (rows vs estimate, %, throughput) | partial | high | S | `StreamChunk` count, parquet num_rows / EXPLAIN estimate |
| Result caching / memoization across re-runs | no | nice | M | AI FIFO cache pattern, key by SQL+source+schema hash |
| Stream Arrow IPC / large local files lazily | no | nice | M | `arrow_loader`, DataFusion `ListingTable` |

### AI & assistive intelligence
| Feature | Have | Priority | Effort | Builds on |
|---|---|---|---|---|
| Secure API key storage (OS keychain) | no | high | S | `AiConfig` persistence + Tauri keyring *(shared w/ secrets)* |
| Query error explainer + one-click auto-fix | partial | high | M | error bar + NL→SQL self-repair loop, schema context |
| Follow-up refinement of generated SQL (diff preview) | no | high | M | `nl_to_sql_request` prior-context pattern, `NlSqlResult` |
| Conversational chat over schema + data (multi-turn agent) | no | high | L | `LlmProvider` streaming, `run_query` as a tool, schema ctx |
| Multi-turn AI session history & request cancellation | no | high | M | `AppStore` persistence, `active_queries`-mirror cancel |
| Inline ghost-text SQL completion (Copilot-style) | no | high | L | CodeMirror + FK schema ctx + `LlmProvider.complete()` |
| Auto-visualization suggestions | no | high | M | Chart Builder config model, `column_types`, structured JSON |
| Result/data summarization (narrate result set) | no | high | M | `StatisticsEngine`, `allow_sample_rows`, useAiStream |
| Privacy / governance controls for AI context (column opt-out) | partial | high | M | `allow_sample_rows`, schema ctx redaction, Ollama |
| AI-assisted EXPLAIN plan interpretation in-context | partial | nice | S | parsed plan node tree → LLM, Explain tab |
| Schema & data documentation generation (persistent) | partial | nice | M | Explain Schema, stable hash cache, export-to-Markdown |
| Provider/model mgmt: cost, token, rate-limit awareness | no | nice | M | `AiConfig`/`AiSettings`, parse usage from responses |
| Semantic/embeddings search over schema & queries (RAG) | no | nice | L | embeddings endpoint, Arrow/DataFusion vector index |

### Collaboration, versioning & sharing
| Feature | Have | Priority | Effort | Builds on |
|---|---|---|---|---|
| Open/Save .sql files on disk (dirty indicator) | no | table-stakes | M | Tauri dialog/fs, query tab model, CodeMirror |
| Workspace/project folder (.sql tree in sidebar) | no | high | M | Tauri fs, sidebar tree components |
| Git status & diff for SQL files | no | high | L | git2 crate / shell-out, CodeMirror merge view |
| Local query version history / diff (non-git) | no | high | M | `HISTORY` infra, AppStore, CodeMirror diff |
| Copy query as shareable text / Markdown | partial | high | S | `setSql` store, AI copy-button pattern, clipboard |
| Shareable/exportable team snippet library | partial | high | M | `SavedQuery` model, sqlTemplateService, file-backed JSON |
| **Secret-free, committable team connection manifest (pairs with keychain/DSN-split)** | no | high | M | DSN split, keychain, workspace folder |
| Query history search, export & reuse (full view) | partial | high | S | `HISTORY` + AppStore, `CommandPalette` fuzzy |
| Inline comments/annotations on saved queries | no | nice | S | `SavedQuery` model + description field |
| **Shared/real-time team state (shared connections, role-based access, result review/commenting)** | no | nice | L | requires a shared backend — *consciously deferred, see Coverage notes* |
| Cross-device query/saved-query sync | no | nice | L | AppStore (move off localStorage), workspace/git path |

### Connectivity & extensibility
| Feature | Have | Priority | Effort | Builds on |
|---|---|---|---|---|
| DuckDB connection (embedded + file) | no | high | L | `DatabaseType` enum / executor trait, duckdb-rs → Arrow |
| Postgres-wire engines (Redshift/CockroachDB/Materialize) | partial | high | M | `get_or_create_pg_pool`, PG executor + dialect label |
| Cloud warehouse connectors (BigQuery, Snowflake) | no | high | L | `ExecutorFactory` trait, reqwest REST/Arrow |
| Object-storage sources (S3 / GCS / Azure) for files | no | high | M | DataFusion `object_store`, URI-based loader |
| **Complex column-type handling (JSON/JSONB, arrays, ENUM, geometry/PostGIS) in grid + serializers** | no | high | M | per-dialect serializers, `VirtualTable` cell render |
| **Acknowledge/route around DataFusion SQL-surface limits (window/PIVOT/list-type/dialect gaps vs DuckDB)** | no | high | M | engine-capability matrix, clear "unsupported syntax" UX, DuckDB fallback |
| Query macros / variables / parameter substitution | no | high | M | *(unified with authoring "Query variables")* |
| LISTEN/NOTIFY support | no | nice | M | sqlx Postgres listener, event stream to UI |
| User-defined functions / custom SQL functions | no | nice | M | DataFusion `register_udf`/`register_udaf` |
| MongoDB / document-store connector | no | nice | L | new non-SQL `QueryExecutor`, nested-value serializer |
| REST/HTTP API as queryable source | no | nice | M | reqwest (json/stream), `json_loader`, `DatasetRegistry` |
| CLI / headless execution mode | no | nice | M | factor `ExecutorFactory`+export into reusable core crate |
| MCP server (expose ArrowLens as agent tool) | no | nice | L | `ExecutorFactory` + read-only validate + headless core |
| MCP client (AI consumes external MCP tools) | no | nice | L | `LlmProvider` + self-repair loop + streaming command |
| ADBC / Flight SQL connectivity | no | nice | L | Arrow-native `serialize_batches`, new executor |
| Runtime plugin / connector SDK | partial | nice | L | existing trait+factory pattern + stable ABI/protocol |

---

## 4. Prioritized Roadmap

### NOW (next) — close the trust/safety floor *and* the distribution/quality floor + headline quick wins
Table-stakes gaps that block adoption, the correctness fixes that make existing features honest, and the packaging/CI/security-hygiene work without which none of it can actually ship to users. These are the price of being taken seriously as a database tool.

- **OS keychain credential storage + DSN splitting** — stop writing DB passwords and API keys to plaintext `app_state.json`; the #1 procurement blocker. *Extends `AppStore`, `DatabaseConnectionInfo`, `AiConfig` (+ `keyring` crate).*
- **Repo-level secret hygiene + hardening** — remove the committed `postgresql://postgres:postgres@…` DSN from `AGENT.md`, rotate it, add a secret-scanning CI gate, set a real `app.security.csp` (currently `null`), and tighten the broad `fs`/`shell`/`dialog` `:default` capability scopes. *Extends `AGENT.md`, `tauri.conf.json`, `capabilities/default.json`.*
- **Code signing + notarization + auto-update in the release pipeline** — unsigned macOS is Gatekeeper-blocked and unsigned Windows trips SmartScreen, so today there is effectively no clean install path; add Apple/Authenticode secrets, the `tauri-plugin-updater` + `updater` config, and update-artifact/keypair generation. *Extends `release.yml`, `tauri.conf.json`.*
- **First test suite + PR-level CI** — there are zero Rust tests and no PR build/lint/typecheck/test gate; add `ci.yml` plus golden-file tests for per-dialect cell serialization (`pg_cell_to_json`, SQLite/MySQL) **and regression tests that lock in the correctness-trap fixes below** so they can't silently re-break. *Adds `vitest`/testing-library, Rust `#[cfg(test)]`, GitHub Actions.*
- **Database object inspector + DDL viewer + column-level tree expansion (incl. views/procs/functions/triggers/sequences/types)** — inspect structure without a `SELECT *`; the most common exploration action. Introspection already exists for AI context; extend it so non-table objects are first-class. *Extends `schema_context.rs`, `ConnectionsList`, `list_schema_tree`.*
- **True server-side DB streaming (replace `fetch_all`) + keyset pagination instead of the 10k clip** — make "streaming" real and stop silently truncating results; a correctness issue, not just perf. *Extends `database_executor.rs`, `run_query`, `StreamChunk`.*
- **Streaming / full-result export + direct Arrow→Parquet writer** — export ALL rows with bounded memory and lossless types; kills the CSV-roundtrip. *Extends `export_api.rs`, `execute_streaming`, parquet `ArrowWriter`.*
- **Copy result selection as TSV / CSV / JSON / Markdown / INSERT** — the most-used "share" action; today only single-cell copy. *Extends `VirtualTable` selection, clipboard, dialect quoting utils.*
- **Per-connection read-only / safe mode + destructive-write confirmation + configurable row limit** — guardrails against accidental prod writes; the validator already exists. *Extends `validate.rs`, `ExecutorFactory`, `QueryToolbar`.*
- **Open / Save `.sql` files on disk** — the foundational unit of versioning and sharing; frees SQL from localStorage. *Extends Tauri dialog/fs, query tab model.*
- **Real SQL formatter + find/replace + run-statement-under-cursor** — daily editor reflexes; the current regex formatter produces broken output. *Extends `formatSql()`, `@codemirror/search`, `run_query_multi` splitter.*
- **Global Settings surface + theme toggle + window-state persistence** — give the many configurable knobs (row limit, timeout, memory cap, CSV dialect, formatter, safe-mode defaults) a home, wire the already-present `next-themes`, and stop resetting window layout each launch. *Extends `AiSettings.tsx` → settings architecture, `tauri-plugin-window-state`.*

### NEXT — unlock the data plane + the analyst's daily analysis loop + the accessibility/onboarding floor
With the floor in place, make ArrowLens a tool you *work in*, not just read from — and one a new or keyboard/SR-dependent user can actually start.

- **Write execution with affected-row counts + transaction control (BEGIN/COMMIT/ROLLBACK)** — run DML/DDL safely with preview-and-rollback. *Extends `DatabaseExecutor.execute`, pinned per-tab connection.*
- **Inline grid edit with backend persistence (UPDATE/INSERT/DELETE by PK)** — make the grid actually editable, not UI-only. *Extends `VirtualTable` pending-edits, PK detection from constraint introspection.*
- **Import wizard (CSV/JSON/Parquet config) + Excel import/export** — load messy real-world files and hand results to stakeholders. *Extends `loaders/*`, `LoaderFactory`, `ExportModal` (+ calamine, rust_xlsxwriter).*
- **Bulk load results/dataset into a connected table (incl. Postgres `COPY` path) + generate CREATE TABLE/INSERT script** — let ArrowLens participate in pipelines (dataset → Postgres). *Extends `DatabaseExecutor`, `SchemaManager`, dialect formatter.*
- **Accessible data grid + keyboard/focus audit + onboarding/empty-state** — ARIA grid semantics and SR announcements on `VirtualTable`, consistent focus-trap/Esc behavior, and a guided first-run using the bundled `sqlite-sakila.db`; this is what makes a keyboard-centric tool usable for everyone and shortens time-to-first-query. *Extends `VirtualTable`, shadcn dialogs, connections panel.*
- **Column profiling panel + value-frequency + null/completeness flags in grid** — surface the stats the backend already computes; the entry point for data-quality work. *Extends `StatisticsEngine`, `statsService`, `VirtualTable`.*
- **Series/group-by dimension + expanded chart library + time-series axis + per-column & locale-aware formatting** — render the charts analysts actually need; fix epoch-millisecond dates and respect locale (decimal comma, date format). *Extends `ChartBuilder`, `ChartCanvas`, `chartUtils`.*
- **Complex column-type rendering (JSON/JSONB, arrays, ENUM, geometry)** — stop breaking on real Postgres schemas. *Extends per-dialect serializers, `VirtualTable` cell render.*
- **Push-down sort & filter + DataFusion memory limit / spill-to-disk** — make the grid an exploration surface over full data, and stop OOM-crashing on big GROUP BY/JOIN. *Extends `VirtualTable` state, `query_engine.rs` `build_context`.*
- **AI: query error explainer + one-click auto-fix, follow-up SQL refinement, result summarization** — high-leverage reuse of the existing self-repair loop and stats. *Extends error bar, `nl_to_sql_request`, `StatisticsEngine`, useAiStream.*
- **Connection SSL/TLS + structured connection editor + statement timeout** — connect to managed cloud Postgres/MySQL and bound runaway queries. *Extends `NewConnectionForm`, pool options, `active_queries`.*
- **Graphical plan tree + buffers/IO accounting + index advisor + estimate-vs-actual flagging** — turn the already-parsed plan tree into actionable diagnostics. *Extends `parseExplainPlan`, `parsePgCosts`, AI perf advisor.*
- **Fuzzy command palette over all history/saved/objects + favorites with folders + per-tab persistence/autosave** — never lose scratch SQL; navigate everything by keyboard. *Extends `CommandPalette`, `SavedQueriesPanel`, `queryStore` → AppStore.*
- **Crash reporting / panic hook + in-app "update available" prompt + changelog** — make field failures visible and updates discoverable now that the updater plumbing exists. *Extends `std::panic::set_hook`, updater events, settings shell.*
- **Frontend + E2E test coverage** — grow the suite from the NOW floor: component tests for the grid/editor and a connect→query→export smoke test. *Extends vitest harness, Playwright + Tauri driver.*

### LATER — strategic bets & differentiation
Bigger architectural moves that elevate ArrowLens from a capable tool to a category leader.

- **DuckDB connection + object-storage (S3/GCS/Azure) + partitioned/glob datasets** — own the modern local-analytics workflow (query a lake folder directly), and use DuckDB as the fallback engine where DataFusion's SQL surface falls short. *Extends DataFusion `object_store`/`ListingTable`, new duckdb-rs connector.*
- **Cloud warehouse + Postgres-wire connectors (Snowflake, BigQuery, Redshift, CockroachDB)** — reach where enterprise data actually lives. *Extends `ExecutorFactory`, PG pool path, reqwest.*
- **Notebook surface with cell-to-cell data passing + provenance/reproducibility + DataFrame/feather interop** — the core ML/EDA loop (chain cells via temp views/CTEs), capture which connection + schema version + params produced a result, and hand results to Pandas/Polars; directly serves the named data/ML-engineer personas and the "beat cloud notebooks" positioning. *Extends DataFusion temp views, `HISTORY`, Arrow IPC export.*
- **Conversational multi-turn AI agent (run-query tool-loop) + persisted AI sessions + inline ghost-text completion** — the paradigm Hex/Mode/DataGrip are racing toward; ArrowLens's FK-rich schema context makes its suggestions good. *Extends `LlmProvider`, `run_query` as a tool, AppStore, CodeMirror.*
- **Data assertions / inline tests + row-level data diff + schema compare** — bring dbt-test / Datafold patterns into an interactive tool; a clear differentiator vs. pure SQL IDEs. *Extends `validate.rs`, DataFusion multi-dataset JOIN, normalized schemas.*
- **Plan diffing + slow-query tracking with trends** — performance-engineering loop end-to-end. *Extends `ExplainNode` trees, persisted `HISTORY` with fingerprints.*
- **Workspace folder + git status/diff + local version history + secret-free team connection manifest** — anchor team collaboration on a repo; pair the keychain/DSN-split work with a committable, secret-free connection manifest teammates can adopt. *Extends Tauri fs, git2, CodeMirror merge view, DSN split.*
- **SSH tunnel + server-side session/kill + audit log + migration runner + scheduled/recurring extraction** — full admin/DevOps story for production databases, including "extract on a schedule." *Extends `DatabaseRegistry`, `active_queries`, `AppStore`, headless core.*
- **Internationalization (i18n framework + localized strings)** — broaden reach once the string surface stabilizes. *Extends a new i18n layer over the (currently hardcoded) UI strings.*
- **Pivot table / dashboards** — mature, repeatable analysis. *Extends pivot SQL gen, saved viz, DataFusion temp views.*
- **CLI/headless mode + MCP server/client + ADBC/Flight SQL + plugin SDK** — automation, agent-accessibility, and community-driven connector breadth. *Extends factored core crate, trait/factory pattern.*

---

## 5. Quick Wins (low effort, high value — all S, build on what exists)

1. **Copy as TSV/CSV/JSON/Markdown (+ range selection)** — the most-requested "share" action; turns a single-cell copy into a first-class grid feature. *`VirtualTable` selection + clipboard + existing serializers.*
2. **Direct Arrow→Parquet writer** — drop the temp-CSV roundtrip; instant correctness + speed win for the format the export modal already markets as "ideal for large datasets." *parquet `ArrowWriter`.*
3. **Find & replace in editor (regex, in-selection)** — mostly wiring `@codemirror/search`; selection-match highlighting is already on.
4. **Configurable row limit + "results truncated" indicator** — make the existing 10k clip visible and adjustable; removes a silent foot-gun. *`QueryToolbar` metrics area.*
5. **Redacted secret display/logging + per-connection env label (prod/dev banner)** — cheap governance: mask `postgres://user:****@host` everywhere and color-code prod. *`DatabaseConnectionInfo` display, `AppError::DB`.*
6. **Comment toggling + keyword-case transform** — `@codemirror/commands` + the existing formatter keyword list.
7. **Summary/overview stats strip on every result** — surface row/col counts + per-column null%/distinct badges the `StatisticsEngine` already computes. *`QueryResultPanel` toolbar, `VirtualTable` header.*
8. **AI "Explain this plan" in the Explain tab** — feed the already-parsed node tree (not raw text) to `LlmProvider.complete()` for node-anchored narration. *useAiStream + parsed plan tree.*
9. **Remove the committed DSN + add a secret-scanning gate** — delete/rotate `postgresql://postgres:postgres@…` in `AGENT.md` and wire gitleaks/trufflehog; near-zero effort, removes a live credential leak. *`AGENT.md`, CI.*
10. **Set a real Content Security Policy** — replace `app.security.csp = null` with an explicit policy for the webview that renders DB/file data and AI markdown. *`tauri.conf.json`.*
11. **Theme toggle + window-state persistence** — wire the already-present `next-themes` to a control and add `tauri-plugin-window-state` so size/position survive restarts. *settings shell, Tauri plugin.*
12. **PR CI gate (build + lint + typecheck)** — a single `ci.yml` on push/PR; immediate guardrail even before the test suite grows. *GitHub Actions.*

*(Honorable mentions, also S: favorites/folders on saved queries, configurable CSV export dialect + BOM, single-row detail view, determinate progress UX, copy-query-as-Markdown.)*

---

## 6. Strategic Differentiators

Parity work (object inspector, transactions, keychain, SSH) — plus the distribution/CI/a11y floor — gets ArrowLens *invited to the table*. These three bets are where its architecture lets it **win**:

**A. Out-of-core, Arrow-native local analytics — beat DataGrip/DBeaver on big local data.**
DataGrip and DBeaver are JDBC row-shufflers; they choke on multi-GB local files. ArrowLens is Arrow-native end-to-end with DataFusion in-process. By adding **memory-pool + spill-to-disk** (`RuntimeEnvBuilder`), **partitioned/glob/object-store datasets** (`ListingTable`), **lazy Arrow IPC scanning**, and **DuckDB round-tripping**, ArrowLens becomes a credible *local analytics warehouse front-end* — the DuckDB-UI workflow — not just a query runner. The **direct Arrow→Parquet** and **streaming export** work means lossless, typed columnar interchange that JDBC tools fundamentally can't match, and Arrow/feather hand-off makes the Pandas/Polars boundary frictionless for ML engineers. One honest caveat to design around: DataFusion's SQL surface trails DuckDB/Postgres (window/PIVOT/list-type/dialect gaps), so the engine-capability matrix and a DuckDB fallback are part of *making* this bet credible, not an afterthought. This is a category the incumbents structurally cannot follow.

**B. AI woven into the workflow — beat everyone on assistive intelligence.**
Most tools bolt a chat box on the side. ArrowLens already has a provider-agnostic, **privacy-first** AI layer (Ollama = zero egress, sample rows off by default, API key never leaves the backend) plus a **self-repair NL→SQL loop** and **FK-rich schema context**. The differentiated play is AI *in the loop*: **one-click error auto-fix** on real execution errors, **follow-up refinement** with diff preview, **plan interpretation anchored to parsed plan nodes**, **auto-viz suggestions** that pre-fill the existing chart config, and eventually a **multi-turn agent that calls `run_query` as a tool** and dry-runs EXPLAIN. Crucially, the **local-only/no-egress guarantee + column-level redaction** lets regulated teams actually *use* the AI — the exact segment that disables AI in cloud tools. "The SQL tool whose AI you can point at prod" is a defensible position — but only once the keychain, CSP, and signing work make "point at prod" a sentence a security team will sign off on.

**C. Data quality & interchange as a first-class surface — beat pure SQL IDEs.**
ArrowLens already computes column statistics, classifies read-only vs. write via sqlparser, registers multiple datasets in one DataFusion context, and produces normalized schemas for every source. That's the substrate for a **dbt-test / Great-Expectations-style assertions panel**, **row-level data diff** (FULL OUTER JOIN across datasets in one DataFusion context — trivial here, hard in JDBC tools), **schema compare**, **duplicate/constraint validation**, and **PII detection → masked export**. Bringing *testing and governance* into an interactive desktop tool — backed by a local-first, no-egress engine and made *trustworthy* by an actual test suite around the very correctness paths (serialization, streaming, Parquet) this story sells — is a genuine wedge against both legacy GUIs (which only browse) and cloud notebooks (which can't be pointed at sensitive prod data on-device).

**Bottom line:** spend the next two horizons reaching parity on safety, structure-browsing, and the data plane — *and* on the unglamorous floor of signing/auto-update, CI/tests, accessibility, and repo hygiene that makes a desktop tool installable and procurable — then double down on out-of-core analytics, in-the-loop AI, and on-device data quality, where ArrowLens's stack is an advantage rather than a liability.

---

## 7. Coverage Notes

- **Consciously deferred (LATER/nice, not dropped):** real-time/multi-user collaboration (shared backend, live co-editing, role-based access, result commenting) is intentionally out of the near-term horizon — ArrowLens is local-first, and the team story is served first by file/git versioning plus a secret-free, committable connection manifest. A shared backend is a deliberate future investment, not an oversight.
- **Scheduled/recurring execution** is positioned in LATER and tied to the headless/CLI core, since it depends on that factoring; it is flagged for the data-engineer persona rather than treated as an immediate need.
- **Internationalization** is scheduled LATER (after the string surface stabilizes), while **accessibility** is pulled into NEXT because the custom virtualized grid is the core surface and a11y debt compounds with every grid feature added.
- **MongoDB/document stores, REST-as-source, UDFs, ADBC/Flight SQL, plugin SDK, ER diagrams, dashboards** remain "nice" — valuable breadth, but not on the critical path to the three differentiators above.
- Every "table-stakes" and most "high" items were cross-checked against the codebase; verified-absent platform gaps (no `tauri-plugin-updater`, no signing secrets in `release.yml`, `bundle.targets:"all"`, zero Rust tests, release-only CI, `csp:null`, single broad `capabilities/default.json`, committed DSN in `AGENT.md`, unwired `next-themes`) are now represented in the gap tables and roadmap rather than implied.