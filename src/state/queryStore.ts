import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { HistoryEntry, QueryResult, SavedQuery, StreamChunk } from "../models/query";
import * as queryService from "../services/queryService";
import { listen } from "@tauri-apps/api/event";
import { useDatabaseState } from "./databaseStore";
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

interface QuerySqlState {
  sql: string;
  setSql: (sql: string) => void;
}

interface QueryExecutionState {
  isRunning: boolean;
  result: QueryResult | null;
  error: string | null;
  streaming: StreamingState;
  isStreaming: boolean;
  explainPlan: string | null;
  isExplaining: boolean;
}

interface QueryExecutionActions {
  runQuery: (connectionIdOverride?: string | null, sqlOverride?: string) => Promise<void>;
  runStreamingQuery: (connectionIdOverride?: string | null, sqlOverride?: string) => Promise<void>;
  cancelQuery: () => void;
  runExplain: (verbose?: boolean, sqlOverride?: string) => Promise<void>;
  clearResult: () => void;
  clearError: () => void;
}

interface QueryHistoryState {
  history: HistoryEntry[];
  loadHistory: () => Promise<void>;
  loadFromHistory: (entry: HistoryEntry) => void;
}

interface QuerySavedState {
  savedQueries: SavedQuery[];
  saveQuery: (name: string, tags?: string[]) => void;
  removeSavedQuery: (id: string) => void;
}

const QuerySqlContext = createContext<QuerySqlState | null>(null);
const QueryExecutionStateContext = createContext<QueryExecutionState | null>(null);
const QueryExecutionActionsContext = createContext<QueryExecutionActions | null>(null);
const QueryHistoryContext = createContext<QueryHistoryState | null>(null);
const QuerySavedContext = createContext<QuerySavedState | null>(null);

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [sql, setStoredSql] = usePersistentState<string>("arrowlens-query-sql", DEFAULT_SQL);
  const [savedQueries, setSavedQueries] = usePersistentState<SavedQuery[]>("arrowlens-saved-queries", []);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [streaming, setStreaming] = useState<StreamingState>({ queryId: null, columns: [], rows: [], isDone: false });
  const [isStreaming, setIsStreaming] = useState(false);
  const [explainPlan, setExplainPlan] = useState<string | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);

  const { selectedConnectionId } = useDatabaseState();
  const { warning, error: showError } = useToast();

  const setSql = useCallback((nextSql: string) => {
    setStoredSql(nextSql);
  }, [setStoredSql]);

  const loadHistory = useCallback(async () => {
    try {
      const nextHistory = await queryService.getQueryHistory();
      setHistory(nextHistory);
    } catch {
      // Ignore history refresh failures.
    }
  }, []);

  const runQuery = useCallback<QueryExecutionActions["runQuery"]>(async (connectionIdOverride = undefined, sqlOverride = undefined) => {
    const effectiveSql = (sqlOverride ?? sql).trim();
    if (!effectiveSql) {
      warning("Please enter a SQL query", "Empty Query");
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
      showError(errorMessage, "Query Error", undefined, 7000);
    }
  }, [sql, selectedConnectionId, loadHistory, showError, warning]);

  const runStreamingQuery = useCallback<QueryExecutionActions["runStreamingQuery"]>(async (connectionIdOverride = undefined, sqlOverride = undefined) => {
    const effectiveSql = (sqlOverride ?? sql).trim();
    if (!effectiveSql) {
      warning("Please enter a SQL query", "Empty Query");
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
        showError(message, "Streaming Query Error", undefined, 7000);
        cleanup();
      });
    } catch (e) {
      const errorMessage = errorToMessage(e);
      setError(errorMessage);
      setIsRunning(false);
      showError(errorMessage, "Query Error", undefined, 7000);
    }
  }, [sql, selectedConnectionId, showError, warning]);

  const cancelQuery = useCallback(() => setIsRunning(false), []);

  const saveQuery = useCallback((name: string, tags: string[] = []) => {
    const entry: SavedQuery = {
      id: crypto.randomUUID(),
      name,
      sql,
      created_at: new Date().toISOString(),
      tags,
    };
    setSavedQueries((current) => [entry, ...current]);
  }, [setSavedQueries, sql]);

  const removeSavedQuery = useCallback((id: string) => {
    setSavedQueries((current) => current.filter((query) => query.id !== id));
  }, [setSavedQueries]);

  const loadFromHistory = useCallback((entry: HistoryEntry) => {
    setSql(entry.sql);
  }, [setSql]);

  const runExplain = useCallback<QueryExecutionActions["runExplain"]>(async (verbose = false, sqlOverride = undefined) => {
    const effectiveSql = (sqlOverride ?? sql).trim();
    if (!effectiveSql) return;
    setIsExplaining(true);
    setExplainPlan(null);
    try {
      const plan = await queryService.explainQuery(effectiveSql, verbose, selectedConnectionId);
      setExplainPlan(plan);
      setIsExplaining(false);
    } catch (e) {
      const message = errorToMessage(e);
      setIsExplaining(false);
      showError(message, "EXPLAIN failed");
    }
  }, [sql, selectedConnectionId, showError]);

  const clearResult = useCallback(() => {
    setResult(null);
    setStreaming({ queryId: null, columns: [], rows: [], isDone: false });
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const sqlValue = useMemo(
    () => ({ sql, setSql }),
    [sql, setSql],
  );

  const executionStateValue = useMemo(
    () => ({
      isRunning,
      result,
      error,
      streaming,
      isStreaming,
      explainPlan,
      isExplaining,
    }),
    [isRunning, result, error, streaming, isStreaming, explainPlan, isExplaining],
  );

  const executionActionsValue = useMemo(
    () => ({
      runQuery,
      runStreamingQuery,
      cancelQuery,
      runExplain,
      clearResult,
      clearError,
    }),
    [runQuery, runStreamingQuery, cancelQuery, runExplain, clearResult, clearError],
  );

  const historyValue = useMemo(
    () => ({
      history,
      loadHistory,
      loadFromHistory,
    }),
    [history, loadHistory, loadFromHistory],
  );

  const savedValue = useMemo(
    () => ({
      savedQueries,
      saveQuery,
      removeSavedQuery,
    }),
    [savedQueries, saveQuery, removeSavedQuery],
  );

  return React.createElement(
    QuerySqlContext.Provider,
    { value: sqlValue },
    React.createElement(
      QueryExecutionStateContext.Provider,
      { value: executionStateValue },
      React.createElement(
        QueryExecutionActionsContext.Provider,
        { value: executionActionsValue },
        React.createElement(
          QueryHistoryContext.Provider,
          { value: historyValue },
          React.createElement(QuerySavedContext.Provider, { value: savedValue }, children),
        ),
      ),
    ),
  );
}

function useRequiredQueryContext<T>(context: React.Context<T | null>, name: string): T {
  const value = useContext(context);
  if (!value) {
    throw new Error(`${name} must be used within QueryProvider`);
  }
  return value;
}

export function useQuerySqlStore() {
  return useRequiredQueryContext(QuerySqlContext, "useQuerySqlStore");
}

export function useQueryExecutionState() {
  return useRequiredQueryContext(QueryExecutionStateContext, "useQueryExecutionState");
}

export function useQueryExecutionActions() {
  return useRequiredQueryContext(QueryExecutionActionsContext, "useQueryExecutionActions");
}

export function useQueryHistoryStore() {
  return useRequiredQueryContext(QueryHistoryContext, "useQueryHistoryStore");
}

export function useSavedQueriesStore() {
  return useRequiredQueryContext(QuerySavedContext, "useSavedQueriesStore");
}

export function useQueryStore(): QueryState {
  return {
    ...useQuerySqlStore(),
    ...useQueryExecutionState(),
    ...useQueryExecutionActions(),
    ...useQueryHistoryStore(),
    ...useSavedQueriesStore(),
  };
}
