import { useEffect, useMemo, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { DatabaseType } from "../../models/database";
import { useDatasetActions, useDatasetCollectionState, useDatasetMetadataState } from "../../state/datasetStore";
import { useDatabaseActions, useDatabaseState } from "../../state/databaseStore";
import { useQuerySqlStore } from "../../state/queryStore";
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

  useEffect(() => {
    loadDatasets();
    loadConnections();
  }, [loadDatasets, loadConnections]);

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
    if (dbType === "sqlite") {
      const file = await openDialog({
        multiple: false,
        filters: [{ name: "SQLite", extensions: ["db", "sqlite", "sqlite3"] }],
      });
      if (typeof file === "string") {
        await connectSqliteDatabase(file, dbName || undefined);
        setDbName("");
        setDbConnString("");
        setAddingConnection(false);
      }
      return;
    }

    if (!dbConnString.trim()) return;
    await connectDatabase(dbType, dbConnString.trim(), dbName || undefined);
    setDbConnString("");
    setDbName("");
    setAddingConnection(false);
  };

  const handleTableQuery = async (tableName: string) => {
    const sql = await buildSelectAllSql(tableName, selectedConnectionId, 100);
    setSql(sql);
  };

  const handleDatasetQuery = async (tableName: string) => {
    const sql = await buildSelectAllSql(tableName, null, 100);
    setSql(sql);
  };

  const handleDatasetColumnQuery = async (tableName: string, columnName: string) => {
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
