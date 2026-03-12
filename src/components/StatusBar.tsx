import React from "react";
import { Database, Zap, AlertCircle, Bug } from "lucide-react";
import { useQueryStore } from "../state/queryStore";
import { useDatasetStore } from "../state/datasetStore";
import { useDatabaseStore } from "../state/databaseStore";
import { useDebugStore } from "../state/debugStore";
import { formatDuration, formatNumber } from "../utils/formatters";
import { getDialectLabel } from "../utils/sql";
import { cn } from "../utils/formatters";

export function StatusBar() {
  const { isRunning, result, error, streaming, isStreaming } = useQueryStore();
  const { datasets, selectedId } = useDatasetStore();
  const { connections, selectedConnectionId } = useDatabaseStore();
  const { debugMode, toggleDebugMode, lastError } = useDebugStore();
  const selectedDataset = datasets.find((d) => d.id === selectedId);
  const selectedConnection = connections.find((c) => c.id === selectedConnectionId);
  const activeDialect = selectedConnection?.database_type ?? "datafusion";

  const rowCount = isStreaming
    ? streaming.rows.length
    : result?.row_count ?? 0;

  const elapsed = isStreaming ? null : result?.elapsed_ms ?? null;

  return (
    <footer className="h-6 flex-shrink-0 flex items-center gap-4 px-3 bg-surface-1 border-t border-border text-xs text-text-muted select-none">
      {/* Left section */}
      <div className="flex items-center gap-3 flex-1">
        {selectedConnection ? (
          <div className="flex items-center gap-1">
            <Database size={11} />
            <span className="text-text-secondary">{selectedConnection.name}</span>
            <span className="text-text-muted">({getDialectLabel(activeDialect)})</span>
          </div>
        ) : selectedDataset && (
          <div className="flex items-center gap-1">
            <Database size={11} />
            <span className="text-text-secondary">{selectedDataset.name}</span>
            {selectedDataset.row_count !== null && (
              <span className="text-text-muted">
                ({formatNumber(selectedDataset.row_count)} rows)
              </span>
            )}
          </div>
        )}
      </div>

      {/* Center — query status */}
      <div className="flex items-center gap-2">
        {error && (
          <div className="flex items-center gap-1 text-accent-red">
            <AlertCircle size={11} />
            <span className="max-w-xs truncate">{error}</span>
          </div>
        )}

        {isRunning && (
          <div className="flex items-center gap-1 text-accent-yellow">
            <Zap size={11} className="animate-pulse" />
            <span>Running…</span>
          </div>
        )}

        {result && !isRunning && (
          <span className="text-accent-green font-mono">
            {formatNumber(rowCount)} rows
            {elapsed !== null && ` · ${formatDuration(elapsed)}`}
          </span>
        )}
      </div>

      {/* Right section */}
      <div className="flex items-center gap-3 text-text-muted">
        <button
          onClick={toggleDebugMode}
          className={cn(
            "flex items-center gap-1 transition-colors",
            debugMode ? "text-accent-peach" : "hover:text-text-secondary"
          )}
          title="Toggle debug mode"
        >
          <Bug size={11} />
          <span>{debugMode ? "Debug On" : "Debug"}</span>
          {debugMode && lastError && <span className="text-accent-red">*</span>}
        </button>
        <span>{datasets.length} dataset{datasets.length !== 1 ? "s" : ""}</span>
        <span className="text-border">|</span>
        <span>ArrowLens v0.1.0</span>
      </div>
    </footer>
  );
}
