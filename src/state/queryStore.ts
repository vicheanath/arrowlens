import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { HistoryEntry, QueryResult, SavedQuery, StatementResult, StreamChunk } from "../models/query";
import { useToast } from "../utils/toast";
import { useConfirm } from "../components/ConfirmDialog";
import { classifyWriteSql, isSingleStatement } from "../utils/sql";
import { errorToMessage } from "../utils/errors";
import { usePersistentState } from "../hooks/usePersistentState";
import { useQueryRuntime } from "../features/query-runtime";

interface StreamingState {
  queryId: string | null;
  columns: string[];
  rows: unknown[][];
  isDone: boolean;
}

/** Lazy load-on-scroll state for a single read-only query. When `active`, the
 * result table is fed page-by-page: page 0 lands for instant first paint and
 * `loadMoreRows` appends the next page as the user nears the bottom. */
interface PaginationState {
  active: boolean;
  sql: string;
  connectionId: string | null;
  pageSize: number;
  /** Rows fetched so far — also the offset for the next page. */
  loaded: number;
  hasMore: boolean;
  isLoadingMore: boolean;
}

const PAGE_SIZE = 1000;

const INACTIVE_PAGINATION: PaginationState = {
  active: false,
  sql: "",
  connectionId: null,
  pageSize: PAGE_SIZE,
  loaded: 0,
  hasMore: false,
  isLoadingMore: false,
};

interface QueryState {
  sql: string;
  isRunning: boolean;
  result: QueryResult | null;
  statementResults: StatementResult[];
  error: string | null;
  history: HistoryEntry[];
  savedQueries: SavedQuery[];
  streaming: StreamingState;
  isStreaming: boolean;
  pagination: PaginationState;
  explainPlan: string | null;
  isExplaining: boolean;

  setSql: (sql: string) => void;
  runQuery: (connectionIdOverride?: string | null, sqlOverride?: string) => Promise<void>;
  runStreamingQuery: (connectionIdOverride?: string | null, sqlOverride?: string) => Promise<void>;
  loadMoreRows: () => void;
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
  /** Multiple result sets from a multi-statement script run (empty for single). */
  statementResults: StatementResult[];
  error: string | null;
  streaming: StreamingState;
  isStreaming: boolean;
  pagination: PaginationState;
  explainPlan: string | null;
  isExplaining: boolean;
}

interface QueryExecutionActions {
  runQuery: (connectionIdOverride?: string | null, sqlOverride?: string) => Promise<void>;
  runStreamingQuery: (connectionIdOverride?: string | null, sqlOverride?: string) => Promise<void>;
  loadMoreRows: () => void;
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
  const [statementResults, setStatementResults] = useState<StatementResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [streaming, setStreaming] = useState<StreamingState>({ queryId: null, columns: [], rows: [], isDone: false });
  const [isStreaming, setIsStreaming] = useState(false);
  const [pagination, setPagination] = useState<PaginationState>(INACTIVE_PAGINATION);
  // Mirror of pagination read by loadMoreRows (kept stable so the scroll-driven
  // callback doesn't churn) plus a re-entrancy guard against rapid scroll fires.
  const paginationRef = useRef(pagination);
  paginationRef.current = pagination;
  const loadingMoreRef = useRef(false);
  const [explainPlan, setExplainPlan] = useState<string | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);

  const { warning, error: showError } = useToast();
  const confirm = useConfirm();
  const runtime = useQueryRuntime();

  // Gate statements that modify a connected database behind a confirmation.
  // Returns true if execution may proceed. Dataset (DataFusion) queries are
  // read-only and never prompt.
  const confirmIfWrite = useCallback(
    async (sql: string, context: { connectionId: string | null; sourceLabel: string }) => {
      if (!context.connectionId) return true;
      const { isWrite, kinds } = classifyWriteSql(sql);
      if (!isWrite) return true;
      return confirm({
        title: "Run a statement that changes the database?",
        description: `This runs ${kinds.join(", ")} against "${context.sourceLabel}". It can modify or delete data and cannot be undone by ArrowLens.`,
        confirmLabel: "Run anyway",
      });
    },
    [confirm],
  );

  const setSql = useCallback((nextSql: string) => {
    setStoredSql(nextSql);
  }, [setStoredSql]);

  const loadHistory = useCallback(async () => {
    try {
      const nextHistory = await runtime.loadQueryHistory();
      setHistory(nextHistory);
    } catch {
      // Ignore history refresh failures.
    }
  }, [runtime]);

  const runQuery = useCallback<QueryExecutionActions["runQuery"]>(async (connectionIdOverride = undefined, sqlOverride = undefined) => {
    const effectiveSql = (sqlOverride ?? sql).trim();
    if (!effectiveSql) {
      warning("Please enter a SQL query", "Empty Query");
      return;
    }

    const context = runtime.resolveExecutionContext(connectionIdOverride);
    if (!(await confirmIfWrite(effectiveSql, context))) return;
    setIsRunning(true);
    setResult(null);
    setStatementResults([]);
    setError(null);
    setIsStreaming(false);
    setPagination(INACTIVE_PAGINATION);
    loadingMoreRef.current = false;

    // Fast path: a single read-only statement is fetched one page at a time so
    // the first rows paint immediately and the rest lazy-load on scroll. If the
    // page wrap can't be applied (e.g. duplicate column names in a derived
    // table), fall through to the standard one-shot path below.
    const isReadOnly = !classifyWriteSql(effectiveSql).isWrite;
    if (isReadOnly && isSingleStatement(effectiveSql)) {
      try {
        const page = await runtime.runQueryPageRequest(effectiveSql, context, 0, PAGE_SIZE);
        setResult(page);
        setPagination({
          active: true,
          sql: effectiveSql,
          connectionId: context.connectionId,
          pageSize: PAGE_SIZE,
          loaded: page.rows.length,
          hasMore: page.rows.length === PAGE_SIZE,
          isLoadingMore: false,
        });
        setIsRunning(false);
        await loadHistory();
        return;
      } catch {
        // Pagination unsupported for this query — fall back to one-shot below.
      }
    }

    try {
      const results = await runtime.runQueryMultiRequest(effectiveSql, context);

      if (results.length <= 1) {
        // Single statement → keep the rich tabbed view (table/chart/explain).
        const only = results[0];
        if (only?.error) {
          setError(only.error);
          showError(only.error, "Query Error", undefined, 7000);
        } else if (only) {
          setResult({
            columns: only.columns,
            column_types: only.column_types,
            rows: only.rows,
            row_count: only.row_count,
            elapsed_ms: only.elapsed_ms,
            truncated: only.truncated,
          });
        }
      } else {
        // Multiple statements → render one table per result set.
        setStatementResults(results);
      }

      setIsRunning(false);
      await loadHistory();
    } catch (e) {
      const errorMessage = errorToMessage(e);
      setError(errorMessage);
      setIsRunning(false);
      showError(errorMessage, "Query Error", undefined, 7000);
    }
  }, [sql, loadHistory, runtime, showError, warning, confirmIfWrite]);

  const runStreamingQuery = useCallback<QueryExecutionActions["runStreamingQuery"]>(async (connectionIdOverride = undefined, sqlOverride = undefined) => {
    const effectiveSql = (sqlOverride ?? sql).trim();
    if (!effectiveSql) {
      warning("Please enter a SQL query", "Empty Query");
      return;
    }

    const context = runtime.resolveExecutionContext(connectionIdOverride);
    if (!(await confirmIfWrite(effectiveSql, context))) return;

    setIsRunning(true);
    setResult(null);
    setStatementResults([]);
    setError(null);
    setIsStreaming(true);
    setPagination(INACTIVE_PAGINATION);
    setStreaming({ queryId: null, columns: [], rows: [], isDone: false });

    try {
      const queryId = await runtime.startStreamingQueryRequest(effectiveSql, context, 500);
      setStreaming((current) => ({ ...current, queryId }));

      await runtime.attachStreamingListeners(queryId, {
        onChunk: (chunk: StreamChunk) => {
          setStreaming((current) => ({
            ...current,
            columns: chunk.columns,
            rows: [...current.rows, ...chunk.rows],
          }));
        },
        onDone: () => {
          setIsRunning(false);
          setStreaming((current) => ({ ...current, isDone: true }));
        },
        onError: (message: string) => {
          setError(message);
          setIsRunning(false);
          showError(message, "Streaming Query Error", undefined, 7000);
        },
      });
    } catch (e) {
      const errorMessage = errorToMessage(e);
      setError(errorMessage);
      setIsRunning(false);
      showError(errorMessage, "Query Error", undefined, 7000);
    }
  }, [sql, runtime, showError, warning, confirmIfWrite]);

  const cancelQuery = useCallback(() => setIsRunning(false), []);

  // Fetch the next page and append it to the current result. Guarded so the
  // burst of scroll events near the bottom only triggers one fetch at a time.
  const loadMoreRows = useCallback(() => {
    const page = paginationRef.current;
    if (!page.active || !page.hasMore || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setPagination((current) => ({ ...current, isLoadingMore: true }));

    void (async () => {
      try {
        const context = runtime.resolveExecutionContext(page.connectionId);
        const next = await runtime.runQueryPageRequest(page.sql, context, page.loaded, page.pageSize);
        setResult((current) =>
          current
            ? {
                ...current,
                rows: [...current.rows, ...next.rows],
                row_count: current.rows.length + next.rows.length,
              }
            : current,
        );
        setPagination((current) => ({
          ...current,
          loaded: current.loaded + next.rows.length,
          hasMore: next.rows.length === current.pageSize,
          isLoadingMore: false,
        }));
      } catch {
        // Stop paging on error rather than retrying the same failing window.
        setPagination((current) => ({ ...current, hasMore: false, isLoadingMore: false }));
      } finally {
        loadingMoreRef.current = false;
      }
    })();
  }, [runtime]);

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
    const context = runtime.resolveExecutionContext();
    setIsExplaining(true);
    setExplainPlan(null);
    try {
      const plan = await runtime.runExplainRequest(effectiveSql, verbose, context);
      setExplainPlan(plan);
      setIsExplaining(false);
    } catch (e) {
      const message = errorToMessage(e);
      setIsExplaining(false);
      showError(message, "EXPLAIN failed");
    }
  }, [runtime, sql, showError]);

  const clearResult = useCallback(() => {
    setResult(null);
    setStatementResults([]);
    setStreaming({ queryId: null, columns: [], rows: [], isDone: false });
    setPagination(INACTIVE_PAGINATION);
    loadingMoreRef.current = false;
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
      statementResults,
      error,
      streaming,
      isStreaming,
      pagination,
      explainPlan,
      isExplaining,
    }),
    [isRunning, result, statementResults, error, streaming, isStreaming, pagination, explainPlan, isExplaining],
  );

  const executionActionsValue = useMemo(
    () => ({
      runQuery,
      runStreamingQuery,
      loadMoreRows,
      cancelQuery,
      runExplain,
      clearResult,
      clearError,
    }),
    [runQuery, runStreamingQuery, loadMoreRows, cancelQuery, runExplain, clearResult, clearError],
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
