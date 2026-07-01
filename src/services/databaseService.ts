import { invokeCommand } from "./tauriService";
import {
  ConnectDatabaseParams,
  ConnectionSchema,
  DatabaseConnectionInfo,
  DatabaseSchemaEntry,
} from "../models/database";

export function connectDatabase(
  params: ConnectDatabaseParams,
): Promise<DatabaseConnectionInfo> {
  return invokeCommand<DatabaseConnectionInfo>("connect_database", {
    databaseType: params.databaseType,
    connectionString: params.connectionString,
    name: params.name ?? null,
  });
}

export function connectSqliteDatabase(
  path: string,
  name?: string,
): Promise<DatabaseConnectionInfo> {
  return connectDatabase({
    databaseType: "sqlite",
    connectionString: path,
    name,
  });
}

/** Verify a connection string is reachable without registering it. Resolves on
 * success, rejects with the backend error message on failure. */
export function testConnection(
  databaseType: ConnectDatabaseParams["databaseType"],
  connectionString: string,
): Promise<void> {
  return invokeCommand<void>("test_connection", {
    databaseType,
    connectionString,
  });
}

export function listDatabaseConnections(): Promise<DatabaseConnectionInfo[]> {
  return invokeCommand<DatabaseConnectionInfo[]>("list_database_connections");
}

export function disconnectDatabase(id: string): Promise<boolean> {
  return invokeCommand<boolean>("disconnect_database", { id });
}

export function listDatabaseTables(connectionId: string): Promise<string[]> {
  return invokeCommand<string[]>("list_database_tables", {
    connectionId,
  });
}

export function listDatabaseSchemaTree(connectionId: string): Promise<DatabaseSchemaEntry[]> {
  return invokeCommand<DatabaseSchemaEntry[]>("list_database_schema_tree", {
    connectionId,
  });
}

export function getConnectionSchema(connectionId: string): Promise<ConnectionSchema> {
  return invokeCommand<ConnectionSchema>("get_connection_schema", { connectionId });
}
