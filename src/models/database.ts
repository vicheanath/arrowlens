import { QueryResult } from "./query";

export type DatabaseType = "sqlite" | "mysql" | "postgres" | "mssql";

export interface DatabaseConnectionInfo {
  id: string;
  name: string;
  database_type: DatabaseType;
  connection_string: string;
  created_at: string;
}

export interface DatabaseTableEntry {
  schema: string;
  name: string;
  full_name: string;
}

export interface DatabaseSchemaEntry {
  name: string;
  tables: DatabaseTableEntry[];
}

export interface InspectedColumn {
  name: string;
  data_type: string;
  nullable: boolean;
  is_primary_key: boolean;
}

export interface InspectedForeignKey {
  from_table: string;
  from_column: string;
  to_table: string;
  to_column: string;
}

export interface InspectedTable {
  schema: string;
  name: string;
  qualified_name: string;
  columns: InspectedColumn[];
  row_estimate: number | null;
}

export interface ConnectionSchema {
  tables: InspectedTable[];
  foreign_keys: InspectedForeignKey[];
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
