import { invokeCommand } from "./tauriService";
import {
  ConnectDatabaseParams,
  DatabaseConnectionInfo,
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
