export type AiProvider = "anthropic" | "openai" | "ollama";

/** Secret-free configuration returned by the backend. */
export interface AiConfigDto {
  enabled: boolean;
  provider: AiProvider;
  model: string;
  base_url: string | null;
  allow_sample_rows: boolean;
  max_tables: number;
  has_api_key: boolean;
  /** Provider is enabled and has everything it needs to make a call. */
  ready: boolean;
}

/**
 * Partial config update. Omitted fields are left unchanged.
 * `api_key`: omit to keep, "" to clear, a value to replace.
 */
export interface AiConfigUpdate {
  enabled?: boolean;
  provider?: AiProvider;
  model?: string;
  api_key?: string;
  base_url?: string;
  allow_sample_rows?: boolean;
  max_tables?: number;
}

export interface ColumnContext {
  name: string;
  data_type: string;
  nullable: boolean;
  is_primary_key: boolean;
}

export interface ForeignKeyRef {
  from_table: string;
  from_column: string;
  to_table: string;
  to_column: string;
}

export interface TableContext {
  schema: string;
  name: string;
  qualified_name: string;
  columns: ColumnContext[];
  row_estimate: number | null;
}

export interface SchemaContext {
  dialect: string;
  tables: TableContext[];
  foreign_keys: ForeignKeyRef[];
  hash: string;
  truncated: boolean;
}

export interface ValidationReport {
  parsed: boolean;
  read_only: boolean;
  statement_count: number;
  message: string | null;
}

export interface NlSqlResult {
  sql: string;
  validation: ValidationReport;
  repaired: boolean;
  explain_ok: boolean;
  explain_error: string | null;
}

/** A suggested natural-language question paired with a ready-to-run, already
 * validated SQL query — grounded in real data when a knowledge base exists. */
export interface SuggestedQuery {
  question: string;
  sql: string;
  rationale: string | null;
}

export type EmbeddingKind = "vector" | "keyword";

/** Snapshot of a connection's persisted schema knowledge base. */
export interface KnowledgeStatus {
  exists: boolean;
  /** True when the knowledge base matches the schema as it stands right now. */
  is_current: boolean;
  table_count: number;
  /** Tables with an actual sampled data profile. Zero here (even if `exists`
   * is true) almost always means the knowledge base was built with "Allow
   * sample rows" off. */
  profiled_count: number;
  embedded_count: number;
  embedding_kind: EmbeddingKind | null;
  built_at: string | null;
  provider: AiProvider | null;
  model: string | null;
}

/** Progress payload streamed while `buildKnowledge` profiles/summarizes/embeds
 * one table at a time. */
export interface KnowledgeProgress {
  table: string;
  done: number;
  total: number;
}

export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI",
  ollama: "Ollama (local)",
};
