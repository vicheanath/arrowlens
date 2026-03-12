import { useEffect, useMemo, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { DatabaseType } from "../models/database";
import { useDatasetActions, useDatasetCollectionState, useDatasetMetadataState } from "../state/datasetStore";
import { useDatabaseActions, useDatabaseState } from "../state/databaseStore";
import { useQuerySqlStore } from "../state/queryStore";
import { buildSelectAll, buildSelectColumn } from "../utils/sql";

export function useDatasetExplorerViewModel() {
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
  const { loadDatasets, importDataset, removeDataset, selectDataset, fetchStats } = useDatasetActions();

  const {
    connections, selectedConnectionId, tablesByConnection,
    isLoading: isDbLoading, isLoadingTables, error: dbError,
  } = useDatabaseState();
  const {
    loadConnections, connectDatabase, connectSqliteDatabase,
    disconnectDatabase, selectConnection, refreshTables,
  } = useDatabaseActions();

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
    } catch (e) {
      console.error("Import cancelled", e);
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

  const handleTableQuery = (tableName: string) => {
    const conn = connections.find((c) => c.id === selectedConnectionId);
    setSql(buildSelectAll(tableName, 100, conn?.database_type ?? "sqlite"));
  };

  const handleDatasetSelect = (id: string) => {
    if (id !== selectedId) {
      selectDataset(id);
      selectConnection(null);
    }
    setExpandedDatasets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleConnectionSelect = (id: string) => {
    selectConnection(id === selectedConnectionId ? null : id);
    if (id !== selectedConnectionId) selectDataset(null);
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
    () => datasets.find((d) => d.id === selectedId),
    [datasets, selectedId],
  );

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
    selectedId,
    schema,
    isLoading,
    error,
    connections,
    selectedConnectionId,
    tablesByConnection,
    isDbLoading,
    isLoadingTables,
    dbError,
    selectedDataset,
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
    handleDatasetSelect,
    handleConnectionSelect,
    toggleConnectionExpanded,
    setSql,
    fetchStats,
    removeDataset,
    disconnectDatabase,
    refreshTables,
    buildSelectAll,
    buildSelectColumn,
  };
}
