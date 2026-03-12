import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { DatabaseConnectionInfo, DatabaseSchemaEntry, DatabaseType } from "../models/database";
import * as databaseService from "../services/databaseService";
import { useToast } from "../utils/toast";
import { errorToMessage } from "../utils/errors";
import { usePersistentState } from "../hooks/usePersistentState";

interface DatabaseState {
  connections: DatabaseConnectionInfo[];
  selectedConnectionId: string | null;
  tablesByConnection: Record<string, string[]>;
  schemaTreeByConnection: Record<string, DatabaseSchemaEntry[]>;
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

interface DatabaseConnectionsState {
  connections: DatabaseConnectionInfo[];
  selectedConnectionId: string | null;
  tablesByConnection: Record<string, string[]>;
  schemaTreeByConnection: Record<string, DatabaseSchemaEntry[]>;
  isLoading: boolean;
  isLoadingTables: boolean;
  error: string | null;
}

interface DatabaseActions {
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

const DatabaseStateContext = createContext<DatabaseConnectionsState | null>(null);
const DatabaseActionsContext = createContext<DatabaseActions | null>(null);

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const [connections, setConnections] = useState<DatabaseConnectionInfo[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = usePersistentState<string | null>(
    "arrowlens-selected-connection-id",
    null,
  );
  const [tablesByConnection, setTablesByConnection] = useState<Record<string, string[]>>({});
  const [schemaTreeByConnection, setSchemaTreeByConnection] = useState<Record<string, DatabaseSchemaEntry[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingTables, setIsLoadingTables] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { success, error: showError } = useToast();

  const refreshTables = useCallback(async (id?: string) => {
    const targetId = id ?? selectedConnectionId;
    if (!targetId) return;
    setIsLoadingTables(true);
    setError(null);
    try {
      const schemaTree = await databaseService.listDatabaseSchemaTree(targetId);
      const tables = schemaTree.flatMap((schema) =>
        schema.tables.map((table) => (schema.name === "main" ? table.name : table.full_name)),
      );
      setSchemaTreeByConnection((current) => ({
        ...current,
        [targetId]: schemaTree,
      }));
      setTablesByConnection((current) => ({
        ...current,
        [targetId]: tables,
      }));
      setIsLoadingTables(false);
    } catch (e) {
      const errorMessage = errorToMessage(e);
      setError(errorMessage);
      setIsLoadingTables(false);
      showError(errorMessage, "Failed to load tables");
    }
  }, [selectedConnectionId, showError]);

  const connectDatabaseInternal = useCallback(async (
    databaseType: DatabaseType,
    connectionString: string,
    name?: string,
  ) => {
    setIsLoading(true);
    setError(null);
    try {
      const info = await databaseService.connectDatabase({ databaseType, connectionString, name });
      setConnections((current) => [info, ...current.filter((connection) => connection.id !== info.id)]);
      setSelectedConnectionId(info.id);
      setIsLoading(false);
      await refreshTables(info.id);
      success(`Connected to ${info.name}`, "Database Connected", 4000);
    } catch (e) {
      const errorMessage = errorToMessage(e);
      setError(errorMessage);
      setIsLoading(false);
      showError(errorMessage, "Connection Failed");
      throw e;
    }
  }, [refreshTables, showError, success]);

  const loadConnections = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const nextConnections = await databaseService.listDatabaseConnections();
      setConnections(nextConnections);
      setSelectedConnectionId((current) =>
        current && nextConnections.some((connection) => connection.id === current) ? current : null,
      );
      setIsLoading(false);
    } catch (e) {
      const errorMessage = errorToMessage(e);
      setError(errorMessage);
      setIsLoading(false);
      showError(errorMessage, "Failed to load database connections");
    }
  }, [showError]);

  const connectDatabase = useCallback(async (databaseType: DatabaseType, connectionString: string, name?: string) => {
    await connectDatabaseInternal(databaseType, connectionString, name);
  }, [connectDatabaseInternal]);

  const connectSqliteDatabase = useCallback(async (path: string, name?: string) => {
    await connectDatabaseInternal("sqlite", path, name);
  }, [connectDatabaseInternal]);

  const disconnectDatabase = useCallback(async (id: string) => {
    try {
      await databaseService.disconnectDatabase(id);
      setConnections((current) => current.filter((connection) => connection.id !== id));
      setSelectedConnectionId((current) => (current === id ? null : current));
      setTablesByConnection((current) => {
        const { [id]: _removed, ...rest } = current;
        return rest;
      });
      setSchemaTreeByConnection((current) => {
        const { [id]: _removed, ...rest } = current;
        return rest;
      });
      success("Database disconnected", undefined, 3000);
    } catch (e) {
      const errorMessage = errorToMessage(e);
      setError(errorMessage);
      showError(errorMessage, "Disconnect Failed");
    }
  }, [showError, success]);

  const selectConnection = useCallback(async (id: string | null) => {
    setSelectedConnectionId(id);
    if (id) {
      await refreshTables(id);
    }
  }, [refreshTables]);

  const clearError = useCallback(() => setError(null), []);

  const stateValue = useMemo(
    () => ({
      connections,
      selectedConnectionId,
      tablesByConnection,
      schemaTreeByConnection,
      isLoading,
      isLoadingTables,
      error,
    }),
    [connections, selectedConnectionId, tablesByConnection, schemaTreeByConnection, isLoading, isLoadingTables, error],
  );

  const actionsValue = useMemo(
    () => ({
      loadConnections,
      connectDatabase,
      connectSqliteDatabase,
      disconnectDatabase,
      selectConnection,
      refreshTables,
      clearError,
    }),
    [loadConnections, connectDatabase, connectSqliteDatabase, disconnectDatabase, selectConnection, refreshTables, clearError],
  );

  return React.createElement(
    DatabaseStateContext.Provider,
    { value: stateValue },
    React.createElement(DatabaseActionsContext.Provider, { value: actionsValue }, children),
  );
}

function useRequiredDatabaseContext<T>(context: React.Context<T | null>, name: string): T {
  const value = useContext(context);
  if (!value) {
    throw new Error(`${name} must be used within DatabaseProvider`);
  }
  return value;
}

export function useDatabaseState() {
  return useRequiredDatabaseContext(DatabaseStateContext, "useDatabaseState");
}

export function useDatabaseActions() {
  return useRequiredDatabaseContext(DatabaseActionsContext, "useDatabaseActions");
}

export function useDatabaseStore(): DatabaseState {
  return {
    ...useDatabaseState(),
    ...useDatabaseActions(),
  };
}
