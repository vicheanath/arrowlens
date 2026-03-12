import type { DatabaseConnectionInfo } from "../../models/database";
import type { DatasetInfo } from "../../models/dataset";
import type { DatabaseSource, DatasetSource } from "./types";

const DATASET_CAPABILITIES = ["query", "streaming", "explain", "preview", "schema", "stats"] as const;
const DATABASE_CAPABILITIES = ["query", "streaming", "explain", "schema", "tables"] as const;

export function createDatasetSource(dataset: DatasetInfo): DatasetSource {
  return {
    key: `dataset:${dataset.id}`,
    id: dataset.id,
    kind: "dataset",
    datasetId: dataset.id,
    name: dataset.name,
    label: dataset.name,
    dialect: "datafusion",
    capabilities: [...DATASET_CAPABILITIES],
    fileType: dataset.file_type,
    rowCount: dataset.row_count,
    schemaJson: dataset.schema_json,
    dataset,
  };
}

export function createDatabaseSource(
  connection: DatabaseConnectionInfo,
  tablesByConnection: Record<string, string[]>,
): DatabaseSource {
  return {
    key: `database:${connection.id}`,
    id: connection.id,
    kind: "database",
    connectionId: connection.id,
    name: connection.name,
    label: connection.name,
    dialect: connection.database_type,
    capabilities: [...DATABASE_CAPABILITIES],
    databaseType: connection.database_type,
    tables: tablesByConnection[connection.id] ?? [],
    connection,
  };
}
