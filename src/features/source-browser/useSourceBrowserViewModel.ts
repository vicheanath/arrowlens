import { useEffect, useMemo, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { DatabaseType } from "../../models/database";
import { useDatasetActions, useDatasetCollectionState, useDatasetMetadataState } from "../../state/datasetStore";
import { useDatabaseActions, useDatabaseState } from "../../state/databaseStore";
import { useQuerySqlStore } from "../../state/queryStore";
import { useOnboarding } from "../../state/uiStore";
import { buildSelectAllSql, buildSelectColumnSql } from "../../services/sqlTemplateService";
import { useSourceCatalog } from "../source-catalog";

export function useSourceBrowserViewModel() {
  const [dbType, setDbType] = useState<DatabaseType>("sqlite");
  const [dbConnString, setDbConnString] = useState("");
  const [dbName, setDbName] = useState("");
  const [datasetsOpen, setDatasetsOpen] = useState(true);
  const [connectionsOpen, setConnectionsOpen] = useState(true);
  const [addingConnection, setAddingConnection] = useState(false);
  const [expandedDatasets, setExpandedDatasets] = useState<Set<string>>(new Set());
  const [expandedConnections, setExpandedConnections] = useState<Set<string>>(new Set());

  const { datasets, selectedId, isLoading, error } = useDatasetCollectionState();
  const { schema } = useDatasetMetadataState();
  const { loadDatasets, importDataset, removeDataset, fetchStats } = useDatasetActions();

  const {
    connections,
    selectedConnectionId,
    tablesByConnection,
    schemaTreeByConnection,
    schemaDetailByConnection,
    isLoading: isDbLoading,
    isLoadingTables,
    error: dbError,
  } = useDatabaseState();

  const {
    loadConnections,
    connectDatabase,
    connectSqliteDatabase,
    disconnectDatabase,
    refreshTables,
  } = useDatabaseActions();

  const {
    sources,
    datasetSources,
    databaseSources,
    canQuery,
    canStats,
    selectSource,
  } = useSourceCatalog();

  const { setSql } = useQuerySqlStore();
  const { newConnectionNonce } = useOnboarding();

  useEffect(() => {
    loadDatasets();
    loadConnections();
  }, [loadDatasets, loadConnections]);

  // The welcome screen / command surfaces can request the New Connection form.
  useEffect(() => {
    if (newConnectionNonce > 0) {
      setConnectionsOpen(true);
      setAddingConnection(true);
    }
  }, [newConnectionNonce]);

  const handleImport = async () => {
    try {
      const file = await openDialog({
        multiple: false,
        filters: [{ name: "Data Files", extensions: ["csv", "parquet", "json", "ndjson", "jsonl", "arrow"] }],
      });
      if (typeof file === "string") await importDataset(file);
    } catch (errorValue) {
      console.error("Import cancelled", errorValue);
    }
  };

  const handleConnectDatabase = async () => {
    // The database store already surfaces success/failure toasts and re-throws on
    // error; we swallow here (after the toast) so a bad connection string doesn't
    // bubble up as an unhandled rejection, and we keep the form open to fix it.
    if (dbType === "sqlite") {
      const file = await openDialog({
        multiple: false,
        filters: [{ name: "SQLite", extensions: ["db", "sqlite", "sqlite3"] }],
      });
      if (typeof file !== "string") return;
      try {
        await connectSqliteDatabase(file, dbName || undefined);
        setDbName("");
        setDbConnString("");
        setAddingConnection(false);
      } catch {
        /* toast already shown by the store */
      }
      return;
    }

    if (!dbConnString.trim()) return;
    try {
      await connectDatabase(dbType, dbConnString.trim(), dbName || undefined);
      setDbConnString("");
      setDbName("");
      setAddingConnection(false);
    } catch {
      /* toast already shown by the store; keep the form open to fix the string */
    }
  };

  const handleTableQuery = async (connectionId: string, tableName: string) => {
    // Make this connection the active source first, otherwise a query run while
    // a dataset (or another connection) is active would route to the wrong
    // backend (e.g. a DataFusion query against a DB table that doesn't exist).
    const source = databaseSources.find((entry) => entry.connectionId === connectionId) ?? null;
    if (source) await selectSource(source);
    const sql = await buildSelectAllSql(tableName, connectionId, 100);
    setSql(sql);
  };

  const handleDatasetQuery = async (tableName: string) => {
    // Querying a dataset must also make it the active source, otherwise a
    // currently-selected DB connection would route this DataFusion query to
    // that database (e.g. "relation ... does not exist" against Postgres).
    const source = datasetSources.find((entry) => entry.name === tableName) ?? null;
    if (source) await selectSource(source);
    const sql = await buildSelectAllSql(tableName, null, 100);
    setSql(sql);
  };

  const handleDatasetColumnQuery = async (tableName: string, columnName: string) => {
    const source = datasetSources.find((entry) => entry.name === tableName) ?? null;
    if (source) await selectSource(source);
    const sql = await buildSelectColumnSql(tableName, columnName, null, 100);
    setSql(sql);
  };

  const handleDatasetSelect = (id: string) => {
    if (id !== selectedId) {
      const source = sources.find((entry) => entry.kind === "dataset" && entry.datasetId === id) ?? null;
      void selectSource(source);
    }
    setExpandedDatasets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleConnectionSelect = (id: string) => {
    const nextId = id === selectedConnectionId ? null : id;
    const source = nextId
      ? sources.find((entry) => entry.kind === "database" && entry.connectionId === nextId) ?? null
      : null;
    void selectSource(source);
  };

  const toggleConnectionExpanded = (id: string) => {
    setExpandedConnections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        next.add(id);
        refreshTables(id);
      }
      return next;
    });
  };

  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === selectedId),
    [datasets, selectedId],
  );

  const datasetCapabilityById = useMemo(() => {
    const map = new Map<string, { canQuery: boolean; canStats: boolean }>();
    for (const source of datasetSources) {
      map.set(source.datasetId, {
        canQuery: source.capabilities.includes("query"),
        canStats: source.capabilities.includes("stats"),
      });
    }
    return map;
  }, [datasetSources]);

  const databaseCapabilityById = useMemo(() => {
    const map = new Map<string, { canQuery: boolean; canInspectTables: boolean }>();
    for (const source of databaseSources) {
      map.set(source.connectionId, {
        canQuery: source.capabilities.includes("query"),
        canInspectTables: source.capabilities.includes("tables"),
      });
    }
    return map;
  }, [databaseSources]);

  const canQueryDataset = (id: string) => datasetCapabilityById.get(id)?.canQuery ?? true;
  const canStatsDataset = (id: string) => datasetCapabilityById.get(id)?.canStats ?? true;
  const canQueryConnection = (id: string) => databaseCapabilityById.get(id)?.canQuery ?? true;
  const canInspectTablesConnection = (id: string) => databaseCapabilityById.get(id)?.canInspectTables ?? true;

  return {
    dbType,
    dbConnString,
    dbName,
    datasetsOpen,
    connectionsOpen,
    addingConnection,
    expandedDatasets,
    expandedConnections,
    datasets,
    datasetSources,
    selectedId,
    schema,
    isLoading,
    error,
    connections,
    databaseSources,
    selectedConnectionId,
    tablesByConnection,
    schemaTreeByConnection,
    schemaDetailByConnection,
    isDbLoading,
    isLoadingTables,
    dbError,
    selectedDataset,
    canQuery,
    canStats,
    canQueryDataset,
    canStatsDataset,
    canQueryConnection,
    canInspectTablesConnection,
    setDbType,
    setDbConnString,
    setDbName,
    setDatasetsOpen,
    setConnectionsOpen,
    setAddingConnection,
    loadDatasets,
    loadConnections,
    handleImport,
    handleConnectDatabase,
    handleTableQuery,
    handleDatasetQuery,
    handleDatasetColumnQuery,
    handleDatasetSelect,
    handleConnectionSelect,
    toggleConnectionExpanded,
    setSql,
    fetchStats,
    removeDataset,
    disconnectDatabase,
    refreshTables,
  };
}
