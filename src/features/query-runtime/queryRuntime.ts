import { listen } from "@tauri-apps/api/event";
import type { HistoryEntry, QueryResult, StreamChunk } from "../../models/query";
import type { Source } from "../../entities/source/types";
import * as queryService from "../../services/queryService";
import { errorToMessage } from "../../utils/errors";
import type { QueryExecutionContext, StreamingHandlers } from "./types";

export function resolveQueryExecutionContext(
  source: Source | null,
  connectionIdOverride?: string | null,
): QueryExecutionContext {
  const connectionId = connectionIdOverride ?? (source?.kind === "database" ? source.connectionId : null);
  return {
    source,
    connectionId,
    backend: connectionId ? "database" : "datafusion",
    sourceLabel: source?.label ?? "Local datasets",
  };
}

export async function runQueryRequest(
  sql: string,
  context: QueryExecutionContext,
): Promise<QueryResult> {
  console.info("[Query Execute]", {
    backend: context.backend,
    connectionId: context.connectionId ?? null,
    source: context.sourceLabel,
    sql,
  });

  return queryService.runQuery(sql, context.connectionId);
}

export async function runExplainRequest(
  sql: string,
  verbose: boolean,
  context: QueryExecutionContext,
): Promise<string> {
  console.info("[Explain Execute]", {
    backend: context.backend,
    connectionId: context.connectionId ?? null,
    source: context.sourceLabel,
    verbose,
    sql,
  });

  return queryService.explainQuery(sql, verbose, context.connectionId);
}

export async function startStreamingQueryRequest(
  sql: string,
  context: QueryExecutionContext,
  chunkSize = 500,
): Promise<string> {
  console.info("[Streaming Query Execute]", {
    backend: context.backend,
    connectionId: context.connectionId ?? null,
    source: context.sourceLabel,
    sql,
  });

  return queryService.runStreamingQuery(sql, chunkSize, context.connectionId);
}

export async function attachStreamingListeners(
  queryId: string,
  handlers: StreamingHandlers,
): Promise<() => void> {
  let unlistenChunk: (() => void) | null = null;
  let unlistenError: (() => void) | null = null;

  const cleanup = () => {
    if (unlistenChunk) {
      unlistenChunk();
      unlistenChunk = null;
    }
    if (unlistenError) {
      unlistenError();
      unlistenError = null;
    }
  };

  unlistenChunk = await listen<StreamChunk>(`query-chunk-${queryId}`, (event) => {
    const chunk = event.payload;
    if (chunk.done) {
      handlers.onDone();
      cleanup();
      return;
    }

    handlers.onChunk(chunk);
  });

  unlistenError = await listen<{ message: string }>(`query-error-${queryId}`, (event) => {
    const message = event.payload?.message ?? errorToMessage(event.payload);
    handlers.onError(message);
    cleanup();
  });

  return cleanup;
}

export async function loadQueryHistory(): Promise<HistoryEntry[]> {
  return queryService.getQueryHistory();
}
