import React, { createContext, useContext, useMemo, useState } from "react";
import { DatabaseConnectionInfo, DatabaseType } from "../models/database";
import * as databaseService from "../services/databaseService";
import { useToast } from "../utils/toast";
import { errorToMessage } from "../utils/errors";

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

const DatabaseContext = createContext<DatabaseState | null>(null);

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const [connections, setConnections] = useState<DatabaseConnectionInfo[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [tablesByConnection, setTablesByConnection] = useState<Record<string, string[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingTables, setIsLoadingTables] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const refreshTables = async (id?: string) => {
    const targetId = id ?? selectedConnectionId;
    if (!targetId) return;
    setIsLoadingTables(true);
    setError(null);
    try {
      const tables = await databaseService.listDatabaseTables(targetId);
      setTablesByConnection((current) => ({
        ...current,
        [targetId]: tables,
      }));
      setIsLoadingTables(false);
    } catch (e) {
      const errorMessage = errorToMessage(e);
      setError(errorMessage);
      setIsLoadingTables(false);
      toast.error(errorMessage, "Failed to load tables");
    }
  };

  const connectDatabaseInternal = async (
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
      toast.success(`Connected to ${info.name}`, "Database Connected", 4000);
    } catch (e) {
      const errorMessage = errorToMessage(e);
      setError(errorMessage);
      setIsLoading(false);
      toast.error(errorMessage, "Connection Failed");
      throw e;
    }
  };

  const value = useMemo<DatabaseState>(
    () => ({
      connections,
      selectedConnectionId,
      tablesByConnection,
      isLoading,
      isLoadingTables,
      error,
      loadConnections: async () => {
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
          toast.error(errorMessage, "Failed to load database connections");
        }
      },
      connectDatabase: async (databaseType, connectionString, name) => {
        await connectDatabaseInternal(databaseType, connectionString, name);
      },
      connectSqliteDatabase: async (path, name) => {
        await connectDatabaseInternal("sqlite", path, name);
      },
      disconnectDatabase: async (id) => {
        try {
          await databaseService.disconnectDatabase(id);
          setConnections((current) => current.filter((connection) => connection.id !== id));
          setSelectedConnectionId((current) => (current === id ? null : current));
          setTablesByConnection((current) => {
            const { [id]: _removed, ...rest } = current;
            return rest;
          });
          toast.success("Database disconnected", undefined, 3000);
        } catch (e) {
          const errorMessage = errorToMessage(e);
          setError(errorMessage);
          toast.error(errorMessage, "Disconnect Failed");
        }
      },
      selectConnection: async (id) => {
        setSelectedConnectionId(id);
        if (id) {
          await refreshTables(id);
        }
      },
      refreshTables,
      clearError: () => setError(null),
    }),
    [connections, selectedConnectionId, tablesByConnection, isLoading, isLoadingTables, error, toast],
  );

  return React.createElement(DatabaseContext.Provider, { value }, children);
}

export function useDatabaseStore() {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error("useDatabaseStore must be used within DatabaseProvider");
  }
  return context;
}
