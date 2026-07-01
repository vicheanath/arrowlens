import { useCallback, useEffect, useMemo, useState } from "react";
import { getConnectionSchema } from "../../services/databaseService";
import { useSourceCatalog } from "../source-catalog/useSourceCatalog";
import { errorToMessage } from "../../utils/errors";
import type {
  ConnectionSchema,
  InspectedForeignKey,
  InspectedTable,
} from "../../models/database";
import type { SqlDialect } from "../../utils/sql";

export type SchemaInspectorStatus = "empty" | "loading" | "ready" | "error";

export interface SchemaInspectorState {
  status: SchemaInspectorStatus;
  /** Normalized tables for the active source (connection tables or one per dataset). */
  tables: InspectedTable[];
  /** Foreign-key relationships. Always empty for datasets (flat files have none). */
  foreignKeys: InspectedForeignKey[];
  error: string | null;
  sourceKind: "database" | "dataset" | null;
  /** Dialect for SQL generation in the editor. */
  dialect: SqlDialect;
  connectionId: string | null;
  /** Only database connections can be altered; datasets are read-only files. */
  isEditable: boolean;
  sourceLabel: string;
  refetch: () => void;
}

const EMPTY_SCHEMA: ConnectionSchema = { tables: [], foreign_keys: [] };
// Stable references so consumers' useMemo/useEffect deps don't fire every render.
const EMPTY_TABLES: InspectedTable[] = [];
const EMPTY_FOREIGN_KEYS: InspectedForeignKey[] = [];

/**
 * Unified schema view over the active source. Database connections are
 * introspected via `get_connection_schema` (tables, columns, primary and
 * foreign keys); datasets are normalized into a single table with no
 * relationships. Backs the Schema Detail, Schema Editor, and ER Diagram tabs.
 */
export function useSchemaInspector(): SchemaInspectorState {
  const {
    activeSource,
    selectedConnectionId,
    selectedDatasetSchema,
    activeDialect,
    activeSourceLabel,
  } = useSourceCatalog();

  const [connectionSchema, setConnectionSchema] = useState<ConnectionSchema>(EMPTY_SCHEMA);
  const [status, setStatus] = useState<SchemaInspectorStatus>("empty");
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const refetch = useCallback(() => setRefreshNonce((n) => n + 1), []);

  // Fetch + cache the introspected schema whenever the active connection changes.
  useEffect(() => {
    if (!selectedConnectionId) {
      setConnectionSchema(EMPTY_SCHEMA);
      return;
    }

    let cancelled = false;
    setStatus("loading");
    setError(null);

    getConnectionSchema(selectedConnectionId)
      .then((schema) => {
        if (cancelled) return;
        setConnectionSchema(schema);
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setConnectionSchema(EMPTY_SCHEMA);
        setError(errorToMessage(err));
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [selectedConnectionId, refreshNonce]);

  // Datasets: one table built from the loaded schema, no foreign keys.
  const datasetTables = useMemo<InspectedTable[]>(() => {
    if (activeSource?.kind !== "dataset" || !selectedDatasetSchema) return [];
    return [
      {
        schema: "",
        name: activeSource.name,
        qualified_name: activeSource.name,
        columns: selectedDatasetSchema.fields.map((field) => ({
          name: field.name,
          data_type: field.data_type,
          nullable: field.nullable,
          is_primary_key: false,
        })),
        row_estimate: activeSource.rowCount,
      },
    ];
  }, [activeSource, selectedDatasetSchema]);

  if (!activeSource) {
    return {
      status: "empty",
      tables: EMPTY_TABLES,
      foreignKeys: EMPTY_FOREIGN_KEYS,
      error: null,
      sourceKind: null,
      dialect: activeDialect,
      connectionId: null,
      isEditable: false,
      sourceLabel: activeSourceLabel,
      refetch,
    };
  }

  if (activeSource.kind === "dataset") {
    return {
      status: datasetTables.length > 0 ? "ready" : "loading",
      tables: datasetTables,
      foreignKeys: EMPTY_FOREIGN_KEYS,
      error: null,
      sourceKind: "dataset",
      dialect: activeDialect,
      connectionId: null,
      isEditable: false,
      sourceLabel: activeSourceLabel,
      refetch,
    };
  }

  return {
    status,
    tables: connectionSchema.tables,
    foreignKeys: connectionSchema.foreign_keys,
    error,
    sourceKind: "database",
    dialect: activeDialect,
    connectionId: selectedConnectionId,
    isEditable: true,
    sourceLabel: activeSourceLabel,
    refetch,
  };
}
