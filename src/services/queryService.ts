import { invokeCommand } from "./tauriService";
import { HistoryEntry, QueryResult, StatementResult } from "../models/query";

export function runQuery(sql: string, connectionId?: string | null): Promise<QueryResult> {
  return invokeCommand<QueryResult>("run_query", { sql, connectionId: connectionId ?? null });
}

/** Fetch one page of a read query (skip `offset` rows, return at most `limit`). */
export function runQueryPage(
  sql: string,
  offset: number,
  limit: number,
  connectionId?: string | null,
): Promise<QueryResult> {
  return invokeCommand<QueryResult>("run_query_page", {
    sql,
    connectionId: connectionId ?? null,
    offset,
    limit,
  });
}

/** Run every statement in a script; returns one result set per statement. */
export function runQueryMulti(sql: string, connectionId?: string | null): Promise<StatementResult[]> {
  return invokeCommand<StatementResult[]>("run_query_multi", { sql, connectionId: connectionId ?? null });
}

/**
 * Starts a streaming query and returns the query_id.
 * The caller must listen for `query-chunk-{queryId}` events via Tauri.
 */
export function runStreamingQuery(
  sql: string,
  chunkSize?: number,
  connectionId?: string | null
): Promise<string> {
  return invokeCommand<string>("run_query_streaming", {
    sql,
    connectionId: connectionId ?? null,
    chunkSize: chunkSize ?? null,
  });
}

export function cancelQuery(queryId: string): Promise<void> {
  return invokeCommand<void>("cancel_query", { queryId });
}

export function getQueryHistory(): Promise<HistoryEntry[]> {
  return invokeCommand<HistoryEntry[]>("get_query_history");
}

export function explainQuery(sql: string, verbose?: boolean, connectionId?: string | null): Promise<string> {
  return invokeCommand<string>("explain_query", { sql, verbose: verbose ?? false, connectionId: connectionId ?? null });
}
