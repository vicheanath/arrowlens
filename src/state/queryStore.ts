import { create } from "zustand";
import { persist } from "zustand/middleware";
import { HistoryEntry, QueryResult, SavedQuery, StreamChunk } from "../models/query";
import * as queryService from "../services/queryService";
import { listen } from "@tauri-apps/api/event";
import { useDatabaseStore } from "./databaseStore";
import { useToastStore } from "../utils/toast";
import { errorToMessage } from "../utils/errors";

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

export const useQueryStore = create<QueryState>()(persist((set, get) => ({
  sql: `-- Welcome to ArrowLens SQL Workspace
-- Load a dataset first, then query it by its name.
-- Example:
-- SELECT * FROM my_table LIMIT 100;
`,
  isRunning: false,
  result: null,
  error: null,
  history: [],
  savedQueries: [],
  streaming: { queryId: null, columns: [], rows: [], isDone: false },
  isStreaming: false,
  explainPlan: null,
  isExplaining: false,

  setSql: (sql: string) => set({ sql }),

  runQuery: async (connectionIdOverride = undefined, sqlOverride = undefined) => {
    const { sql } = get();
    const effectiveSql = (sqlOverride ?? sql).trim();
    if (!effectiveSql) {
      useToastStore.getState().addToast({
        type: "warning",
        message: "Please enter a SQL query",
        title: "Empty Query",
      });
      return;
    }
    set({ isRunning: true, result: null, error: null, isStreaming: false });
    try {
      const selectedConnectionId = connectionIdOverride ?? useDatabaseStore.getState().selectedConnectionId;
      console.info("[Query Execute]", {
        backend: selectedConnectionId ? "database" : "datafusion",
        connectionId: selectedConnectionId ?? null,
        sql: effectiveSql,
      });
      const result = await queryService.runQuery(effectiveSql, selectedConnectionId);
      set({ result, isRunning: false });
      get().loadHistory();
    } catch (e) {
      const errorMessage = errorToMessage(e);
      set({ error: errorMessage, isRunning: false });
      useToastStore.getState().addToast({
        type: "error",
        message: errorMessage,
        title: "Query Error",
        duration: 7000,
      });
    }
  },

  runStreamingQuery: async (connectionIdOverride = undefined, sqlOverride = undefined) => {
    const { sql } = get();
    const effectiveSql = (sqlOverride ?? sql).trim();
    if (!effectiveSql) {
      useToastStore.getState().addToast({
        type: "warning",
        message: "Please enter a SQL query",
        title: "Empty Query",
      });
      return;
    }

    const selectedConnectionId = connectionIdOverride ?? useDatabaseStore.getState().selectedConnectionId;
    console.info("[Streaming Query Execute]", {
      backend: selectedConnectionId ? "database" : "datafusion",
      connectionId: selectedConnectionId ?? null,
      sql: effectiveSql,
    });

    set({
      isRunning: true,
      result: null,
      error: null,
      isStreaming: true,
      streaming: { queryId: null, columns: [], rows: [], isDone: false },
    });

    try {
      const queryId = await queryService.runStreamingQuery(effectiveSql, 500, selectedConnectionId);

      set((s) => ({ streaming: { ...s.streaming, queryId } }));

      // Use a shared cleanup to prevent listener leaks on both success and error.
      let unlistenChunk: (() => void) | null = null;
      let unlistenError: (() => void) | null = null;
      const cleanup = () => {
        if (unlistenChunk) { unlistenChunk(); unlistenChunk = null; }
        if (unlistenError) { unlistenError(); unlistenError = null; }
      };

      unlistenChunk = await listen<StreamChunk>(
        `query-chunk-${queryId}`,
        (event) => {
          const chunk = event.payload;
          if (chunk.done) {
            set({ isRunning: false });
            set((s) => ({ streaming: { ...s.streaming, isDone: true } }));
            cleanup();
          } else {
            set((s) => ({
              streaming: {
                ...s.streaming,
                columns: chunk.columns,
                rows: [...s.streaming.rows, ...chunk.rows],
              },
            }));
          }
        }
      );

      unlistenError = await listen<{ message: string }>(
        `query-error-${queryId}`,
        (event) => {
          const msg = event.payload?.message ?? errorToMessage(event.payload);
          set({ error: msg, isRunning: false });
          useToastStore.getState().addToast({
            type: "error",
            message: msg,
            title: "Streaming Query Error",
            duration: 7000,
          });
          cleanup();
        }
      );
    } catch (e) {
      const errorMessage = errorToMessage(e);
      set({ error: errorMessage, isRunning: false });
      useToastStore.getState().addToast({
        type: "error",
        message: errorMessage,
        title: "Query Error",
        duration: 7000,
      });
    }
  },

  cancelQuery: () => {
    set({ isRunning: false });
  },

  loadHistory: async () => {
    try {
      const history = await queryService.getQueryHistory();
      set({ history });
    } catch {
      // ignore
    }
  },

  saveQuery: (name: string, tags: string[] = []) => {
    const { sql } = get();
    const entry: SavedQuery = {
      id: crypto.randomUUID(),
      name,
      sql,
      created_at: new Date().toISOString(),
      tags,
    };
    set((s) => ({ savedQueries: [entry, ...s.savedQueries] }));
  },

  removeSavedQuery: (id: string) => {
    set((s) => ({ savedQueries: s.savedQueries.filter((q) => q.id !== id) }));
  },

  loadFromHistory: (entry: HistoryEntry) => {
    set({ sql: entry.sql });
  },

  runExplain: async (verbose = false, sqlOverride = undefined) => {
    const { sql } = get();
    const effectiveSql = (sqlOverride ?? sql).trim();
    if (!effectiveSql) return;
    set({ isExplaining: true, explainPlan: null });
    try {
      const plan = await queryService.explainQuery(effectiveSql, verbose);
      set({ explainPlan: plan, isExplaining: false });
    } catch (e) {
      const msg = errorToMessage(e);
      set({ isExplaining: false });
      useToastStore.getState().addToast({ type: "error", title: "EXPLAIN failed", message: msg });
    }
  },

  clearResult: () => set({ result: null, streaming: { queryId: null, columns: [], rows: [], isDone: false } }),
  clearError: () => set({ error: null }),
}), {
  name: "arrowlens-query-store",
  partialize: (state) => ({
    savedQueries: state.savedQueries,
    sql: state.sql,
  }),
}));
