import type { QueryResult, StreamChunk } from "../../models/query";
import type { Source } from "../../entities/source/types";

export interface StreamingStateSnapshot {
  queryId: string | null;
  columns: string[];
  rows: unknown[][];
  isDone: boolean;
}

export interface QueryExecutionContext {
  source: Source | null;
  connectionId: string | null;
  backend: "database" | "datafusion";
  sourceLabel: string;
}

export interface StreamingHandlers {
  onChunk: (chunk: StreamChunk) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

export interface QueryRuntimeApi {
  runQuery: (sql: string, connectionId?: string | null) => Promise<QueryResult>;
  runStreamingQuery: (sql: string, chunkSize?: number, connectionId?: string | null) => Promise<string>;
  explainQuery: (sql: string, verbose?: boolean, connectionId?: string | null) => Promise<string>;
  loadHistory: () => Promise<import("../../models/query").HistoryEntry[]>;
}
