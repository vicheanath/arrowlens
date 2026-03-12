import React, { useEffect } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  Upload,
  Trash2,
  RefreshCw,
  BarChart2,
  Table as TableIcon,
  Database,
  Link,
  Plus,
} from "lucide-react";
import { useDatasetStore } from "../state/datasetStore";
import { useDatabaseStore } from "../state/databaseStore";
import { useQueryStore } from "../state/queryStore";
import { SchemaTree } from "../components/SchemaTree";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { formatBytes, formatNumber } from "../utils/formatters";
import { buildSelectAll, buildSelectColumn } from "../utils/sql";
import { cn } from "../utils/formatters";
import { DatasetSchema } from "../models/dataset";
import { DatabaseType } from "../models/database";

export function DatasetExplorer() {
  const [dbType, setDbType] = React.useState<DatabaseType>("sqlite");
  const [dbConnString, setDbConnString] = React.useState("");
  const [dbName, setDbName] = React.useState("");

  const {
    datasets,
    selectedId,
    schema,
    isLoading,
    error,
    loadDatasets,
    importDataset,
    removeDataset,
    selectDataset,
    fetchStats,
  } = useDatasetStore();

  const {
    connections,
    selectedConnectionId,
    tablesByConnection,
    isLoading: isDbLoading,
    isLoadingTables,
    error: dbError,
    loadConnections,
    connectDatabase,
    connectSqliteDatabase,
    disconnectDatabase,
    selectConnection,
    refreshTables,
  } = useDatabaseStore();

  const { setSql } = useQueryStore();

  const schemaMap: Record<string, DatasetSchema> = {};
  if (schema && selectedId) schemaMap[selectedId] = schema;

  useEffect(() => {
    loadDatasets();
    loadConnections();
  }, []);

  const handleImport = async () => {
    try {
      const file = await openDialog({
        multiple: false,
        filters: [
          {
            name: "Data Files",
            extensions: ["csv", "parquet", "json", "ndjson", "jsonl", "arrow"],
          },
        ],
      });
      if (typeof file === "string") {
        await importDataset(file);
      }
    } catch (e) {
      console.error("Import cancelled", e);
    }
  };

  const handleRemove = async (id: string) => {
    await removeDataset(id);
  };

  const handleSelectFromQuery = (datasetName: string) => {
    setSql(buildSelectAll(datasetName, 100, "datafusion"));
  };

  const selectedDataset = datasets.find((d) => d.id === selectedId);
  const selectedConnection = connections.find((c) => c.id === selectedConnectionId) ?? null;
  const selectedTables = selectedConnectionId
    ? tablesByConnection[selectedConnectionId] ?? []
    : [];

  const handleConnectDatabase = async () => {
    if (dbType === "sqlite") {
      const file = await openDialog({
        multiple: false,
        filters: [{ name: "SQLite", extensions: ["db", "sqlite", "sqlite3"] }],
      });
      if (typeof file === "string") {
        await connectSqliteDatabase(file, dbName || undefined);
        setDbName("");
      }
      return;
    }

    if (!dbConnString.trim()) return;
    await connectDatabase(dbType, dbConnString.trim(), dbName || undefined);
    setDbConnString("");
    setDbName("");
  };

  const handleTableQuery = (tableName: string) => {
    const dialect = selectedConnection?.database_type ?? "sqlite";
    setSql(buildSelectAll(tableName, 100, dialect));
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border flex-shrink-0">
        <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
          Datasets
        </span>
        <div className="flex items-center gap-1">
          <button onClick={loadDatasets} className="btn-ghost p-1" title="Refresh">
            <RefreshCw size={13} />
          </button>
          <button onClick={handleImport} className="btn-ghost p-1 text-accent-blue" title="Import">
            <Upload size={13} />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-3 py-2 text-xs text-accent-red bg-accent-red/10 border-b border-accent-red/20">
          {error}
        </div>
      )}

      {/* Dataset tree */}
      <div className="flex-1 overflow-y-auto min-h-0 px-1">
        {isLoading ? (
          <div className="py-8 flex justify-center">
            <LoadingSpinner size={18} />
          </div>
        ) : (
          <SchemaTree
            datasets={datasets}
            schemas={schemaMap}
            selectedId={selectedId}
            onSelect={selectDataset}
            onColumnClick={(table, col) => setSql(buildSelectColumn(table, col, 100, "datafusion"))}
          />
        )}

        <div className="mt-3 border-t border-border/60 pt-3 px-2 pb-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              Databases
            </span>
            <button onClick={loadConnections} className="btn-ghost p-1" title="Refresh connections">
              <RefreshCw size={12} />
            </button>
          </div>

          {dbError && (
            <div className="px-2 py-1.5 text-xs text-accent-red bg-accent-red/10 border border-accent-red/20 rounded mb-2">
              {dbError}
            </div>
          )}

          <div className="panel p-2 mb-2 space-y-2">
            <div className="grid grid-cols-3 gap-1">
              {(["sqlite", "mysql", "postgres"] as DatabaseType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setDbType(t)}
                  className={cn(
                    "btn-ghost text-xs py-1 px-2 justify-center",
                    dbType === t && "bg-accent-blue/15 text-accent-blue"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>

            {dbType !== "sqlite" && (
              <input
                className="input w-full text-xs"
                placeholder={
                  dbType === "mysql"
                    ? "mysql://user:pass@localhost:3306/db"
                    : "postgres://user:pass@localhost:5432/db"
                }
                value={dbConnString}
                onChange={(e) => setDbConnString(e.target.value)}
              />
            )}

            <input
              className="input w-full text-xs"
              placeholder="Connection name (optional)"
              value={dbName}
              onChange={(e) => setDbName(e.target.value)}
            />

            <button
              onClick={handleConnectDatabase}
              className="btn-primary text-xs w-full justify-center"
              disabled={isDbLoading}
            >
              {dbType === "sqlite" ? <Database size={12} /> : <Link size={12} />}
              {dbType === "sqlite" ? "Choose SQLite File" : "Connect"}
            </button>
          </div>

          <div className="space-y-1">
            {connections.map((c) => {
              const selected = c.id === selectedConnectionId;
              return (
                <div key={c.id} className="rounded border border-border/60 bg-surface-1">
                  <div className="flex items-center gap-1 p-1.5">
                    <button
                      onClick={() => selectConnection(selected ? null : c.id)}
                      className={cn(
                        "flex-1 btn-ghost text-xs py-1 px-1.5 justify-start",
                        selected && "bg-accent-blue/15 text-accent-blue"
                      )}
                      title={c.connection_string}
                    >
                      <Database size={12} />
                      <span className="text-truncate">{c.name}</span>
                      <span className="ml-auto text-[10px] uppercase opacity-70">{c.database_type}</span>
                    </button>
                    <button
                      onClick={() => disconnectDatabase(c.id)}
                      className="btn-danger text-xs py-1 px-1.5"
                      title="Disconnect"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>

                  {selected && (
                    <div className="px-2 pb-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] uppercase tracking-wider text-text-muted">Tables</span>
                        <button
                          className="btn-ghost p-1"
                          onClick={() => refreshTables(c.id)}
                          title="Refresh tables"
                        >
                          <RefreshCw size={11} />
                        </button>
                      </div>
                      {isLoadingTables ? (
                        <div className="py-1 flex justify-center">
                          <LoadingSpinner size={14} />
                        </div>
                      ) : selectedTables.length === 0 ? (
                        <div className="text-xs text-text-muted italic px-1 py-1">
                          No tables found
                        </div>
                      ) : (
                        <div className="max-h-32 overflow-y-auto space-y-0.5">
                          {selectedTables.map((table) => (
                            <button
                              key={table}
                              className="w-full btn-ghost text-xs py-1 px-1.5 justify-start"
                              onClick={() => handleTableQuery(table)}
                            >
                              <Plus size={10} />
                              <span className="text-truncate">{table}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {!isDbLoading && connections.length === 0 && (
              <div className="text-xs text-text-muted italic px-1 py-1">
                No database connections yet
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Selected dataset details */}
      {selectedDataset && (
        <div className="flex-shrink-0 border-t border-border bg-surface-1 px-3 py-2 space-y-2">
          <div className="text-xs text-text-secondary font-medium">{selectedDataset.name}</div>
          <div className="grid grid-cols-2 gap-1 text-xs text-text-muted">
            <span>Type</span>
            <span className="text-text-secondary uppercase">{selectedDataset.file_type}</span>
            <span>Size</span>
            <span className="text-text-secondary font-mono">{formatBytes(selectedDataset.size_bytes)}</span>
            {selectedDataset.row_count !== null && (
              <>
                <span>Rows</span>
                <span className="text-text-secondary font-mono">{formatNumber(selectedDataset.row_count)}</span>
              </>
            )}
          </div>
          <div className="flex gap-1 flex-wrap">
            <button
              onClick={() => handleSelectFromQuery(selectedDataset.name)}
              className="btn-ghost text-xs py-0.5 px-2 flex items-center gap-1"
            >
              <TableIcon size={11} />
              Query
            </button>
            <button
              onClick={() => fetchStats(selectedDataset.id)}
              className="btn-ghost text-xs py-0.5 px-2 flex items-center gap-1"
            >
              <BarChart2 size={11} />
              Stats
            </button>
            <button
              onClick={() => handleRemove(selectedDataset.id)}
              className="btn-danger text-xs py-0.5 px-2 flex items-center gap-1 ml-auto"
            >
              <Trash2 size={11} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
