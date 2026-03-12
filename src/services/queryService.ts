import { invokeCommand } from "./tauriService";
import { HistoryEntry, QueryResult } from "../models/query";

export function runQuery(sql: string): Promise<QueryResult> {
  return invokeCommand<QueryResult>("run_query", { sql });
}

/**
 * Starts a streaming query and returns the query_id.
 * The caller must listen for `query-chunk-{queryId}` events via Tauri.
 */
export function runStreamingQuery(
  sql: string,
  chunkSize?: number
): Promise<string> {
  return invokeCommand<string>("run_query_streaming", {
    sql,
    chunkSize: chunkSize ?? null,
  });
}

export function cancelQuery(queryId: string): Promise<void> {
  return invokeCommand<void>("cancel_query", { queryId });
}

export function getQueryHistory(): Promise<HistoryEntry[]> {
  return invokeCommand<HistoryEntry[]>("get_query_history");
}
