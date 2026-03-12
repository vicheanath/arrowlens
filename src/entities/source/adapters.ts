import type { DatabaseConnectionInfo } from "../../models/database";
import type { DatasetInfo } from "../../models/dataset";
import type { Source } from "./types";
import { createDatabaseSource, createDatasetSource } from "./factories";

export interface SourceCatalogContext {
  datasets: DatasetInfo[];
  connections: DatabaseConnectionInfo[];
  tablesByConnection: Record<string, string[]>;
}

export interface SourceCatalogAdapter {
  id: string;
  createSources: (context: SourceCatalogContext) => Source[];
}

export const databaseSourceAdapter: SourceCatalogAdapter = {
  id: "database",
  createSources: ({ connections, tablesByConnection }) =>
    connections.map((connection) => createDatabaseSource(connection, tablesByConnection)),
};

export const datasetSourceAdapter: SourceCatalogAdapter = {
  id: "dataset",
  createSources: ({ datasets }) => datasets.map(createDatasetSource),
};

export const DEFAULT_SOURCE_CATALOG_ADAPTERS: SourceCatalogAdapter[] = [
  databaseSourceAdapter,
  datasetSourceAdapter,
];
