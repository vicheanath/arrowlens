import React from "react";
import { Play, Zap, Bookmark, Loader2, X, Database, Download, FileSearch } from "lucide-react";
import { SqlDialect, getDialectLabel } from "../../utils/sql";
import { formatDuration, cn } from "../../utils/formatters";

interface QueryToolbarProps {
  isRunning: boolean;
  isExplaining: boolean;
  hasResult: boolean;
  hasStreamingRows: boolean;
  streamingRowsCount: number;
  selectedConnectionId: string | null;
  activeSourceLabel: string;
  activeDialect: SqlDialect;
  elapsedMs?: number;
  rowCount?: number;
  showSaveInput: boolean;
  saveName: string;
  onSaveNameChange: (value: string) => void;
  onOpenSave: () => void;
  onCancelSave: () => void;
  onConfirmSave: () => void;
  onRun: () => void;
  onRunSelected: () => void;
  onStream: () => void;
  onCancel: () => void;
  onExplain: () => void;
  onExport: () => void;
  onFormat: () => void;
  onInsertSelectTemplate: () => void;
  onInsertCountTemplate: () => void;
}

export function QueryToolbar({
  isRunning,
  isExplaining,
  hasResult,
  hasStreamingRows,
  streamingRowsCount,
  selectedConnectionId,
  activeSourceLabel,
  activeDialect,
  elapsedMs,
  rowCount,
  showSaveInput,
  saveName,
  onSaveNameChange,
  onOpenSave,
  onCancelSave,
  onConfirmSave,
  onRun,
  onRunSelected,
  onStream,
  onCancel,
  onExplain,
  onExport,
  onFormat,
  onInsertSelectTemplate,
  onInsertCountTemplate,
}: QueryToolbarProps) {
  return (
    <div className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-border bg-surface-2">
      <button onClick={onRun} disabled={isRunning} className="btn-primary text-xs flex items-center gap-1.5" title="Run Query (Cmd+Enter)">
        {isRunning ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Run
      </button>

      <button onClick={onRunSelected} disabled={isRunning} className="btn-ghost text-xs flex items-center gap-1.5" title="Run selected SQL only">
        <Play size={13} /> Run Selected
      </button>

      <button onClick={onStream} disabled={isRunning} className="btn-ghost text-xs flex items-center gap-1.5 text-accent-teal" title="Run Streaming (Cmd+Shift+Enter)">
        <Zap size={13} /> Stream
      </button>

      {isRunning && (
        <button onClick={onCancel} className="btn-ghost text-xs text-accent-red">
          <X size={13} /> Cancel
        </button>
      )}

      <div className="h-4 w-px bg-border ml-1" />

      <button onClick={onFormat} className="btn-ghost text-xs" title="Format SQL">Format</button>
      <button onClick={onInsertSelectTemplate} className="btn-ghost text-xs" title="Insert SELECT template">SELECT *</button>
      <button onClick={onInsertCountTemplate} className="btn-ghost text-xs" title="Insert COUNT template">COUNT</button>

      <div className="flex items-center gap-1 rounded bg-surface-3 px-2 py-1 text-[11px] text-text-muted">
        <Database size={11} />
        <span className="text-text-secondary">{activeSourceLabel}</span>
        <span className="opacity-50">.</span>
        <span>{getDialectLabel(activeDialect)}</span>
      </div>

      {!selectedConnectionId && (
        <button onClick={onExplain} disabled={isRunning || isExplaining} className="btn-ghost text-xs flex items-center gap-1.5 text-text-muted" title="Show query execution plan">
          {isExplaining ? <Loader2 size={13} className="animate-spin" /> : <FileSearch size={13} />} Explain
        </button>
      )}

      {typeof rowCount === "number" && (
        <span className="text-xs text-text-muted font-mono">
          {rowCount.toLocaleString()} rows
          {elapsedMs !== undefined && ` . ${formatDuration(elapsedMs)}`}
        </span>
      )}

      {hasStreamingRows && (
        <span className="text-xs text-accent-teal font-mono animate-pulse">↓ {streamingRowsCount.toLocaleString()} rows streaming...</span>
      )}

      {(hasResult || hasStreamingRows) && (
        <button onClick={onExport} className="btn-ghost text-xs flex items-center gap-1.5 text-text-muted ml-auto" title="Export results">
          <Download size={13} /> Export
        </button>
      )}

      {showSaveInput ? (
        <form
          className="flex items-center gap-1 ml-auto"
          onSubmit={(e) => {
            e.preventDefault();
            onConfirmSave();
          }}
        >
          <input
            autoFocus
            type="text"
            placeholder="Query name..."
            value={saveName}
            onChange={(e) => onSaveNameChange(e.target.value)}
            className="text-xs bg-surface-3 border border-border rounded px-2 py-1 text-text-secondary placeholder:text-text-muted outline-none focus:border-accent-blue w-36"
          />
          <button type="submit" className="btn-primary text-xs px-2 py-1">Save</button>
          <button type="button" onClick={onCancelSave} className="btn-ghost text-xs px-1 py-1"><X size={12} /></button>
        </form>
      ) : (
        <button
          onClick={onOpenSave}
          className={cn("btn-ghost text-xs flex items-center gap-1.5 text-text-muted", !(hasResult || hasStreamingRows) && "ml-auto")}
          title="Save query"
        >
          <Bookmark size={13} /> Save
        </button>
      )}
    </div>
  );
}
