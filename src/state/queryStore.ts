import { create } from "zustand";
import { HistoryEntry, QueryResult, SavedQuery, StreamChunk } from "../models/query";
import * as queryService from "../services/queryService";
import * as databaseService from "../services/databaseService";
import { listen } from "@tauri-apps/api/event";
import { useDatabaseStore } from "./databaseStore";
import { useToastStore } from "../utils/toast";

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

  setSql: (sql: string) => void;
  runQuery: () => Promise<void>;
  runStreamingQuery: () => Promise<void>;
  cancelQuery: () => void;
  loadHistory: () => Promise<void>;
  saveQuery: (name: string, tags?: string[]) => void;
  removeSavedQuery: (id: string) => void;
  loadFromHistory: (entry: HistoryEntry) => void;
  clearResult: () => void;
  clearError: () => void;
}

export const useQueryStore = create<QueryState>((set, get) => ({
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

  setSql: (sql: string) => set({ sql }),

  runQuery: async () => {
    const { sql } = get();
    if (!sql.trim()) {
      useToastStore.getState().addToast({
        type: "warning",
        message: "Please enter a SQL query",
        title: "Empty Query",
      });
      return;
    }
    set({ isRunning: true, result: null, error: null, isStreaming: false });
    try {
      const selectedConnectionId = useDatabaseStore.getState().selectedConnectionId;
      const result = selectedConnectionId
        ? await databaseService.runDatabaseQuery(selectedConnectionId, sql)
        : await queryService.runQuery(sql);
      set({ result, isRunning: false });
      get().loadHistory();
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      set({ error: errorMessage, isRunning: false });
      useToastStore.getState().addToast({
        type: "error",
        message: errorMessage,
        title: "Query Error",
        duration: 7000,
      });
    }
  },

  runStreamingQuery: async () => {
    const { sql } = get();
    if (!sql.trim()) {
      useToastStore.getState().addToast({
        type: "warning",
        message: "Please enter a SQL query",
        title: "Empty Query",
      });
      return;
    }

    const selectedConnectionId = useDatabaseStore.getState().selectedConnectionId;
    if (selectedConnectionId) {
      // Streaming bridge is currently implemented for DataFusion datasets only.
      useToastStore.getState().addToast({
        type: "info",
        message: "Streaming is available for local datasets only. Using standard query execution.",
        title: "Database Streaming",
        duration: 5000,
      });
      await get().runQuery();
      return;
    }

    set({
      isRunning: true,
      result: null,
      error: null,
      isStreaming: true,
      streaming: { queryId: null, columns: [], rows: [], isDone: false },
    });

    try {
      const queryId = await queryService.runStreamingQuery(sql);
      set((s) => ({ streaming: { ...s.streaming, queryId } }));

      const unlistenChunk = await listen<StreamChunk>(
        `query-chunk-${queryId}`,
        (event) => {
          const chunk = event.payload;
          if (chunk.done) {
            set({ isRunning: false });
            set((s) => ({ streaming: { ...s.streaming, isDone: true } }));
            unlistenChunk();
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

      const unlistenError = await listen<string>(
        `query-error-${queryId}`,
        (event) => {
          set({ error: event.payload, isRunning: false });
          useToastStore.getState().addToast({
            type: "error",
            message: event.payload,
            title: "Streaming Query Error",
            duration: 7000,
          });
          unlistenChunk();
          unlistenError();
        }
      );
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
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

  clearResult: () => set({ result: null, streaming: { queryId: null, columns: [], rows: [], isDone: false } }),
  clearError: () => set({ error: null }),
}));
