import type { DatabaseConnectionInfo, DatabaseType } from "../../models/database";
import type { DatasetInfo, DatasetSchema, FileType } from "../../models/dataset";
import type { SqlDialect } from "../../utils/sql";

export type SourceKind = "dataset" | "database";

export type SourceCapability =
  | "query"
  | "streaming"
  | "explain"
  | "preview"
  | "schema"
  | "stats"
  | "tables";

interface BaseSource {
  key: string;
  id: string;
  kind: SourceKind;
  name: string;
  label: string;
  dialect: SqlDialect;
  capabilities: SourceCapability[];
}

export interface DatasetSource extends BaseSource {
  kind: "dataset";
  datasetId: string;
  fileType: FileType;
  rowCount: number | null;
  schemaJson: string | null;
  dataset: DatasetInfo;
}

export interface DatabaseSource extends BaseSource {
  kind: "database";
  connectionId: string;
  databaseType: DatabaseType;
  tables: string[];
  connection: DatabaseConnectionInfo;
}

export type Source = DatasetSource | DatabaseSource;

export interface SourceCatalogSelection {
  source: Source | null;
  selectedDatasetId: string | null;
  selectedConnectionId: string | null;
}

export interface SourceSchemaDescriptor {
  source: Source | null;
  completionSchema: Record<string, unknown>;
  selectedDatasetSchema: DatasetSchema | null;
  recommendations: string[];
}
