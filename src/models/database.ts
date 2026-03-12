import { QueryResult } from "./query";

export type DatabaseType = "sqlite" | "mysql" | "postgres";

export interface DatabaseConnectionInfo {
  id: string;
  name: string;
  database_type: DatabaseType;
  connection_string: string;
  created_at: string;
}

export interface RunDatabaseQueryParams {
  connectionId: string;
  sql: string;
  limit?: number;
}

export interface ConnectDatabaseParams {
  databaseType: DatabaseType;
  connectionString: string;
  name?: string;
}

export type DatabaseQueryResult = QueryResult;
