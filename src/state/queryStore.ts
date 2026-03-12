import React, { createContext, useContext, useMemo, useState } from "react";
import { HistoryEntry, QueryResult, SavedQuery, StreamChunk } from "../models/query";
import * as queryService from "../services/queryService";
import { listen } from "@tauri-apps/api/event";
import { useDatabaseStore } from "./databaseStore";
import { useToast } from "../utils/toast";
import { errorToMessage } from "../utils/errors";
import { usePersistentState } from "../hooks/usePersistentState";

interface StreamingState {
  queryId: string | null;
  columns: string[];
  rows: unknown[][];
  isDone: boolean;
}

interface QueryState {
  sql: string;
  isRunning: boolean;
  result: QueryResult | null;
  error: string | null;
  history: HistoryEntry[];
  savedQueries: SavedQuery[];
  streaming: StreamingState;
  isStreaming: boolean;
  explainPlan: string | null;
  isExplaining: boolean;

  setSql: (sql: string) => void;
  runQuery: (connectionIdOverride?: string | null, sqlOverride?: string) => Promise<void>;
  runStreamingQuery: (connectionIdOverride?: string | null, sqlOverride?: string) => Promise<void>;
  cancelQuery: () => void;
  loadHistory: () => Promise<void>;
  saveQuery: (name: string, tags?: string[]) => void;
  removeSavedQuery: (id: string) => void;
  loadFromHistory: (entry: HistoryEntry) => void;
  runExplain: (verbose?: boolean, sqlOverride?: string) => Promise<void>;
  clearResult: () => void;
  clearError: () => void;
}

const DEFAULT_SQL = `-- Welcome to ArrowLens SQL Workspace
-- Load a dataset first, then query it by its name.
-- Example:
-- SELECT * FROM my_table LIMIT 100;
`;

const QueryContext = createContext<QueryState | null>(null);

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [sql, setSql] = usePersistentState<string>("arrowlens-query-sql", DEFAULT_SQL);
  const [savedQueries, setSavedQueries] = usePersistentState<SavedQuery[]>("arrowlens-saved-queries", []);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [streaming, setStreaming] = useState<StreamingState>({ queryId: null, columns: [], rows: [], isDone: false });
  const [isStreaming, setIsStreaming] = useState(false);
  const [explainPlan, setExplainPlan] = useState<string | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);

  const { selectedConnectionId } = useDatabaseStore();
  const toast = useToast();

  const loadHistory = async () => {
    try {
      const nextHistory = await queryService.getQueryHistory();
      setHistory(nextHistory);
    } catch {
      // Ignore history refresh failures.
    }
  };

  const value = useMemo<QueryState>(
    () => ({
      sql,
      isRunning,
      result,
      error,
      history,
      savedQueries,
      streaming,
      isStreaming,
      explainPlan,
      isExplaining,
      setSql,
      runQuery: async (connectionIdOverride = undefined, sqlOverride = undefined) => {
        const effectiveSql = (sqlOverride ?? sql).trim();
        if (!effectiveSql) {
          toast.warning("Please enter a SQL query", "Empty Query");
          return;
        }

        const effectiveConnectionId = connectionIdOverride ?? selectedConnectionId;
        setIsRunning(true);
        setResult(null);
        setError(null);
        setIsStreaming(false);

        try {
          console.info("[Query Execute]", {
            backend: effectiveConnectionId ? "database" : "datafusion",
            connectionId: effectiveConnectionId ?? null,
            sql: effectiveSql,
          });

          const nextResult = await queryService.runQuery(effectiveSql, effectiveConnectionId);
          setResult(nextResult);
          setIsRunning(false);
          await loadHistory();
        } catch (e) {
          const errorMessage = errorToMessage(e);
          setError(errorMessage);
          setIsRunning(false);
          toast.error(errorMessage, "Query Error", undefined, 7000);
        }
      },
      runStreamingQuery: async (connectionIdOverride = undefined, sqlOverride = undefined) => {
        const effectiveSql = (sqlOverride ?? sql).trim();
        if (!effectiveSql) {
          toast.warning("Please enter a SQL query", "Empty Query");
          return;
        }

        const effectiveConnectionId = connectionIdOverride ?? selectedConnectionId;
        console.info("[Streaming Query Execute]", {
          backend: effectiveConnectionId ? "database" : "datafusion",
          connectionId: effectiveConnectionId ?? null,
          sql: effectiveSql,
        });

        setIsRunning(true);
        setResult(null);
        setError(null);
        setIsStreaming(true);
        setStreaming({ queryId: null, columns: [], rows: [], isDone: false });

        try {
          const queryId = await queryService.runStreamingQuery(effectiveSql, 500, effectiveConnectionId);
          setStreaming((current) => ({ ...current, queryId }));

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
              setIsRunning(false);
              setStreaming((current) => ({ ...current, isDone: true }));
              cleanup();
              return;
            }

            setStreaming((current) => ({
              ...current,
              columns: chunk.columns,
              rows: [...current.rows, ...chunk.rows],
            }));
          });

          unlistenError = await listen<{ message: string }>(`query-error-${queryId}`, (event) => {
            const message = event.payload?.message ?? errorToMessage(event.payload);
            setError(message);
            setIsRunning(false);
            toast.error(message, "Streaming Query Error", undefined, 7000);
            cleanup();
          });
        } catch (e) {
          const errorMessage = errorToMessage(e);
          setError(errorMessage);
          setIsRunning(false);
          toast.error(errorMessage, "Query Error", undefined, 7000);
        }
      },
      cancelQuery: () => setIsRunning(false),
      loadHistory,
      saveQuery: (name: string, tags: string[] = []) => {
        const entry: SavedQuery = {
          id: crypto.randomUUID(),
          name,
          sql,
          created_at: new Date().toISOString(),
          tags,
        };
        setSavedQueries((current) => [entry, ...current]);
      },
      removeSavedQuery: (id: string) => {
        setSavedQueries((current) => current.filter((query) => query.id !== id));
      },
      loadFromHistory: (entry: HistoryEntry) => {
        setSql(entry.sql);
      },
      runExplain: async (verbose = false, sqlOverride = undefined) => {
        const effectiveSql = (sqlOverride ?? sql).trim();
        if (!effectiveSql) return;
        setIsExplaining(true);
        setExplainPlan(null);
        try {
          const plan = await queryService.explainQuery(effectiveSql, verbose);
          setExplainPlan(plan);
          setIsExplaining(false);
        } catch (e) {
          const message = errorToMessage(e);
          setIsExplaining(false);
          toast.error(message, "EXPLAIN failed");
        }
      },
      clearResult: () => {
        setResult(null);
        setStreaming({ queryId: null, columns: [], rows: [], isDone: false });
      },
      clearError: () => setError(null),
    }),
    [sql, isRunning, result, error, history, savedQueries, streaming, isStreaming, explainPlan, isExplaining, selectedConnectionId, toast, setSql, setSavedQueries],
  );

  return React.createElement(QueryContext.Provider, { value }, children);
}

export function useQueryStore() {
  const context = useContext(QueryContext);
  if (!context) {
    throw new Error("useQueryStore must be used within QueryProvider");
  }
  return context;
}
