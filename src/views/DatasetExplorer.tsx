import React from "react";
import { Upload, Trash2, BarChart2, RefreshCw, Play, Plus } from "lucide-react";
import { formatBytes, formatNumber } from "../utils/formatters";
import { SectionHeader, IconBtn } from "../components/sidebar/SidebarPrimitives";
import { DatasetTree } from "../components/sidebar/DatasetTree";
import { NewConnectionForm } from "../components/sidebar/NewConnectionForm";
import { ConnectionsList } from "../components/sidebar/ConnectionsList";
import { useDatasetExplorerViewModel } from "../view-models/useDatasetExplorerViewModel";

export function DatasetExplorer() {
  const vm = useDatasetExplorerViewModel();

  const {
    dbType,
    dbName,
    dbConnString,
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
    loadDatasets,
    handleImport,
    setDatasetsOpen,
    setConnectionsOpen,
    connections,
    dbError,
    loadConnections,
    setAddingConnection,
    isDbLoading,
    setDbType,
    setDbName,
    setDbConnString,
    handleConnectDatabase,
    selectedConnectionId,
    tablesByConnection,
    isLoadingTables,
    handleConnectionSelect,
    toggleConnectionExpanded,
    refreshTables,
    disconnectDatabase,
    handleTableQuery,
    fetchStats,
    removeDataset,
    handleDatasetSelect,
    setSql,
    selectedDataset,
    buildSelectAll,
    buildSelectColumn,
  } = vm;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface-1 select-none">

      {/* ══════ DATASETS section ══════ */}
      <SectionHeader
        label="Datasets"
        open={datasetsOpen}
        onToggle={() => setDatasetsOpen(v => !v)}
        count={datasets.length > 0 ? datasets.length : undefined}
        primaryAction={{ icon: <Upload size={12} />, title: "Import dataset", onClick: handleImport }}
        secondaryAction={{ icon: <RefreshCw size={12} />, title: "Refresh", onClick: loadDatasets }}
      />

      {datasetsOpen && (
        <div className="flex-shrink-0 overflow-y-auto" style={{ maxHeight: "44%" }}>
          <DatasetTree
            datasets={datasets}
            selectedId={selectedId}
            schema={schema}
            isLoading={isLoading}
            error={error}
            expandedIds={expandedDatasets}
            onSelect={handleDatasetSelect}
            onQuery={name => setSql(buildSelectAll(name, 100, "datafusion"))}
            onStats={id => fetchStats(id)}
            onRemove={id => removeDataset(id)}
            onColumnQuery={(table, col) => setSql(buildSelectColumn(table, col, 100, "datafusion"))}
            onImport={handleImport}
          />
        </div>
      )}

      <div className="flex-shrink-0 h-px bg-border/30" />

      {/* ══════ CONNECTIONS section ══════ */}
      <SectionHeader
        label="Connections"
        open={connectionsOpen}
        onToggle={() => setConnectionsOpen(v => !v)}
        count={connections.length > 0 ? connections.length : undefined}
        primaryAction={{
          icon: <Plus size={12} />,
          title: addingConnection ? "Cancel new connection" : "New connection",
          onClick: () => { setAddingConnection(v => !v); setConnectionsOpen(true); },
          active: addingConnection,
        }}
        secondaryAction={{ icon: <RefreshCw size={12} />, title: "Refresh connections", onClick: loadConnections }}
      />

      {connectionsOpen && (
        <div className="flex-1 overflow-y-auto min-h-0">
          {dbError && (
            <div className="mx-2 my-1 px-2 py-1 text-[11px] text-accent-red bg-accent-red/10 rounded border border-accent-red/20">
              {dbError}
            </div>
          )}

          {addingConnection && (
            <NewConnectionForm
              dbType={dbType}
              dbName={dbName}
              dbConnString={dbConnString}
              isLoading={isDbLoading}
              onDbTypeChange={setDbType}
              onDbNameChange={setDbName}
              onDbConnStringChange={setDbConnString}
              onConnect={handleConnectDatabase}
              onCancel={() => setAddingConnection(false)}
            />
          )}

          <ConnectionsList
            connections={connections}
            selectedConnectionId={selectedConnectionId}
            tablesByConnection={tablesByConnection}
            isLoadingTables={isLoadingTables}
            expandedIds={expandedConnections}
            onSelectConnection={handleConnectionSelect}
            onToggleExpanded={toggleConnectionExpanded}
            onRefreshTables={id => refreshTables(id)}
            onDisconnect={id => disconnectDatabase(id)}
            onTableQuery={handleTableQuery}
            onAddConnection={() => { setAddingConnection(true); setConnectionsOpen(true); }}
          />
        </div>
      )}

      {/* ══════ DATASET INFO footer ══════ */}
      {selectedDataset && (
        <div className="flex-shrink-0 border-t border-border/50 bg-surface-2 px-3 py-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">Dataset Info</span>
            <IconBtn
              onClick={() => removeDataset(selectedDataset.id)}
              title="Remove dataset"
              icon={<Trash2 size={11} />}
              variant="red"
            />
          </div>
          <div className="text-xs text-text-secondary font-medium truncate mb-2">{selectedDataset.name}</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] mb-2.5">
            <span className="text-text-muted">Type</span>
            <span className="text-text-secondary font-mono uppercase">{selectedDataset.file_type}</span>
            <span className="text-text-muted">Size</span>
            <span className="text-text-secondary font-mono">{formatBytes(selectedDataset.size_bytes)}</span>
            {selectedDataset.row_count !== null && (
              <>
                <span className="text-text-muted">Rows</span>
                <span className="text-text-secondary font-mono">{formatNumber(selectedDataset.row_count)}</span>
              </>
            )}
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setSql(buildSelectAll(selectedDataset.name, 100, "datafusion"))}
              className="btn-ghost text-xs py-0.5 px-2 gap-1"
            >
              <Play size={11} /> Query
            </button>
            <button
              onClick={() => fetchStats(selectedDataset.id)}
              className="btn-ghost text-xs py-0.5 px-2 gap-1"
            >
              <BarChart2 size={11} /> Stats
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
