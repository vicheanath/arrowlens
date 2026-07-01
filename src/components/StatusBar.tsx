import React from "react";
import { Database, Zap, AlertCircle, Bug } from "lucide-react";
import { useQueryExecutionState } from "../state/queryStore";
import { useDatasetCollectionState } from "../state/datasetStore";
import { useDatabaseState } from "../state/databaseStore";
import { useDebugErrorState, useDebugModeState } from "../state/debugStore";
import { formatDuration, formatNumber } from "../utils/formatters";
import { getDialectLabel } from "../utils/sql";
import { cn } from "../utils/formatters";
import { Separator } from "@/components/ui/separator";

export function StatusBar() {
  const { isRunning, result, error, streaming, isStreaming } = useQueryExecutionState();
  const { datasets, selectedId } = useDatasetCollectionState();
  const { connections, selectedConnectionId } = useDatabaseState();
  const { debugMode, toggleDebugMode } = useDebugModeState();
  const { lastError } = useDebugErrorState();
  const selectedDataset = datasets.find((d) => d.id === selectedId);
  const selectedConnection = connections.find((c) => c.id === selectedConnectionId);
  const activeDialect = selectedConnection?.database_type ?? "datafusion";

  const rowCount = isStreaming
    ? streaming.rows.length
    : result?.row_count ?? 0;

  const elapsed = isStreaming ? null : result?.elapsed_ms ?? null;

  return (
    <footer className="flex h-6 flex-shrink-0 select-none items-center gap-4 border-t border-border bg-card px-3 text-xs text-muted-foreground">
      {/* Left section */}
      <div className="flex flex-1 items-center gap-3">
        {selectedConnection ? (
          <div className="flex items-center gap-1">
            <Database size={11} />
            <span className="text-foreground/80">{selectedConnection.name}</span>
            <span className="text-muted-foreground">({getDialectLabel(activeDialect)})</span>
          </div>
        ) : selectedDataset && (
          <div className="flex items-center gap-1">
            <Database size={11} />
            <span className="text-foreground/80">{selectedDataset.name}</span>
            {selectedDataset.row_count !== null && (
              <span className="text-muted-foreground">
                ({formatNumber(selectedDataset.row_count)} rows)
              </span>
            )}
          </div>
        )}
      </div>

      {/* Center — query status */}
      <div className="flex items-center gap-2">
        {error && (
          <div className="flex items-center gap-1 text-destructive">
            <AlertCircle size={11} />
            <span className="max-w-xs truncate">{error}</span>
          </div>
        )}

        {isRunning && (
          <div className="flex items-center gap-1 text-foreground">
            <Zap size={11} className="animate-pulse" />
            <span>Running…</span>
          </div>
        )}

        {result && !isRunning && (
          <span className="font-mono text-foreground">
            {formatNumber(rowCount)} rows
            {elapsed !== null && ` · ${formatDuration(elapsed)}`}
          </span>
        )}
      </div>

      {/* Right section */}
      <div className="flex items-center gap-3 text-muted-foreground">
        <button
          onClick={toggleDebugMode}
          className={cn(
            "flex items-center gap-1 transition-colors",
            debugMode ? "text-foreground" : "hover:text-foreground/80"
          )}
          title="Toggle debug mode"
        >
          <Bug size={11} />
          <span>{debugMode ? "Debug On" : "Debug"}</span>
          {debugMode && lastError && <span className="text-destructive">*</span>}
        </button>
        <span>{datasets.length} dataset{datasets.length !== 1 ? "s" : ""}</span>
        <Separator orientation="vertical" className="h-3" />
        <span>ArrowLens v0.1.0</span>
      </div>
    </footer>
  );
}
