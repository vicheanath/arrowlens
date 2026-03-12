import { create } from "zustand";
import { DatabaseConnectionInfo, DatabaseType } from "../models/database";
import * as databaseService from "../services/databaseService";
import { useToastStore } from "../utils/toast";

interface DatabaseState {
  connections: DatabaseConnectionInfo[];
  selectedConnectionId: string | null;
  tablesByConnection: Record<string, string[]>;
  isLoading: boolean;
  isLoadingTables: boolean;
  error: string | null;

  loadConnections: () => Promise<void>;
  connectDatabase: (
    databaseType: DatabaseType,
    connectionString: string,
    name?: string,
  ) => Promise<void>;
  connectSqliteDatabase: (path: string, name?: string) => Promise<void>;
  disconnectDatabase: (id: string) => Promise<void>;
  selectConnection: (id: string | null) => Promise<void>;
  refreshTables: (id?: string) => Promise<void>;
  clearError: () => void;
}

export const useDatabaseStore = create<DatabaseState>((set, get) => ({
  connections: [],
  selectedConnectionId: null,
  tablesByConnection: {},
  isLoading: false,
  isLoadingTables: false,
  error: null,

  loadConnections: async () => {
    set({ isLoading: true, error: null });
    try {
      const connections = await databaseService.listDatabaseConnections();
      const selectedConnectionId = get().selectedConnectionId;
      const stillSelected =
        selectedConnectionId && connections.some((c) => c.id === selectedConnectionId)
          ? selectedConnectionId
          : null;
      set({ connections, selectedConnectionId: stillSelected, isLoading: false });
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      set({ error: errorMessage, isLoading: false });
      useToastStore.getState().addToast({
        type: "error",
        message: errorMessage,
        title: "Failed to load database connections",
      });
    }
  },

  connectDatabase: async (databaseType, connectionString, name) => {
    set({ isLoading: true, error: null });
    try {
      const info = await databaseService.connectDatabase({
        databaseType,
        connectionString,
        name,
      });
      set((s) => ({
        connections: [info, ...s.connections.filter((c) => c.id !== info.id)],
        selectedConnectionId: info.id,
        isLoading: false,
      }));
      await get().refreshTables(info.id);
      useToastStore.getState().addToast({
        type: "success",
        message: `Connected to ${info.name}`,
        title: "Database Connected",
        duration: 4000,
      });
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      set({ error: errorMessage, isLoading: false });
      useToastStore.getState().addToast({
        type: "error",
        message: errorMessage,
        title: "Connection Failed",
      });
    }
  },

  connectSqliteDatabase: async (path, name) => {
    await get().connectDatabase("sqlite", path, name);
  },

  disconnectDatabase: async (id) => {
    try {
      await databaseService.disconnectDatabase(id);
      set((s) => {
        const nextSelected = s.selectedConnectionId === id ? null : s.selectedConnectionId;
        const { [id]: _removed, ...restTables } = s.tablesByConnection;
        return {
          connections: s.connections.filter((c) => c.id !== id),
          selectedConnectionId: nextSelected,
          tablesByConnection: restTables,
        };
      });
      useToastStore.getState().addToast({
        type: "success",
        message: "Database disconnected",
        duration: 3000,
      });
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      set({ error: errorMessage });
      useToastStore.getState().addToast({
        type: "error",
        message: errorMessage,
        title: "Disconnect Failed",
      });
    }
  },

  selectConnection: async (id) => {
    set({ selectedConnectionId: id });
    if (id) {
      await get().refreshTables(id);
    }
  },

  refreshTables: async (id) => {
    const targetId = id ?? get().selectedConnectionId;
    if (!targetId) return;
    set({ isLoadingTables: true, error: null });
    try {
      const tables = await databaseService.listDatabaseTables(targetId);
      set((s) => ({
        tablesByConnection: {
          ...s.tablesByConnection,
          [targetId]: tables,
        },
        isLoadingTables: false,
      }));
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      set({ error: errorMessage, isLoadingTables: false });
      useToastStore.getState().addToast({
        type: "error",
        message: errorMessage,
        title: "Failed to load tables",
      });
    }
  },

  clearError: () => set({ error: null }),
}));
