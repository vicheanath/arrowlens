export interface QueryResult {
  columns: string[];
  column_types: string[];
  rows: unknown[][];
  row_count: number;
  elapsed_ms: number;
}

export interface StreamChunk {
  query_id: string;
  chunk_index: number;
  columns: string[];
  rows: unknown[][];
  row_count: number;
  done: boolean;
}

export interface HistoryEntry {
  id: string;
  sql: string;
  executed_at: string;
  elapsed_ms: number | null;
  row_count: number | null;
  error: string | null;
}

export type SortOrder = "asc" | "desc" | null;

export interface SortConfig {
  column: string;
  order: SortOrder;
}

export interface FilterConfig {
  column: string;
  value: string;
}

export interface SavedQuery {
  id: string;
  name: string;
  sql: string;
  created_at: string;
  tags: string[];
}

export function formatElapsed(ms: number | null): string {
  if (ms === null) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
