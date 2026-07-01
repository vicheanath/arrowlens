import React from "react";
import { Play, Zap, Bookmark, Loader2, X, Database, Download, FileSearch, Sparkles } from "lucide-react";
import { SqlDialect, getDialectLabel } from "../../utils/sql";
import { formatDuration } from "../../utils/formatters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

interface QueryToolbarProps {
  isRunning: boolean;
  isExplaining: boolean;
  canQuery: boolean;
  canStream: boolean;
  canExplain: boolean;
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
  onStream: () => void;
  onCancel: () => void;
  onExplain: () => void;
  onExport: () => void;
  onFormat: () => void;
  onInsertSelectTemplate: () => void;
  onInsertCountTemplate: () => void;
  onToggleAi: () => void;
  aiActive: boolean;
}

export function QueryToolbar({
  isRunning,
  isExplaining,
  canQuery,
  canStream,
  canExplain,
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
  onStream,
  onCancel,
  onExplain,
  onExport,
  onFormat,
  onInsertSelectTemplate,
  onInsertCountTemplate,
  onToggleAi,
  aiActive,
}: QueryToolbarProps) {
  return (
    <div className="flex flex-shrink-0 items-center gap-1.5 border-b border-border bg-card px-3 py-1.5">
      <Button
        size="sm"
        onClick={onRun}
        disabled={isRunning || !canQuery}
        title={canQuery ? "Run Query (Cmd+Enter)" : "Query execution is not supported for this source"}
      >
        {isRunning ? <Loader2 className="animate-spin" /> : <Play />} Run
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={onStream}
        disabled={isRunning || !canQuery || !canStream}
        title={
          !canQuery
            ? "Query execution is not supported for this source"
            : canStream
              ? "Run Streaming (Cmd+Shift+Enter)"
              : "Streaming is not supported for this source"
        }
      >
        <Zap /> Stream
      </Button>

      {isRunning && (
        <Button variant="destructive" size="sm" onClick={onCancel}>
          <X /> Cancel
        </Button>
      )}

      <Separator orientation="vertical" className="mx-1 h-4" />

      <Button variant="ghost" size="sm" onClick={onFormat} disabled={!canQuery} title="Format SQL">
        Format
      </Button>
      <Button variant="ghost" size="sm" onClick={onInsertSelectTemplate} disabled={!canQuery} title="Insert SELECT template">
        SELECT *
      </Button>
      <Button variant="ghost" size="sm" onClick={onInsertCountTemplate} disabled={!canQuery} title="Insert COUNT template">
        COUNT
      </Button>

      <div className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
        <Database size={11} />
        <span className="text-foreground/80">{activeSourceLabel}</span>
        <span className="opacity-50">.</span>
        <span>{getDialectLabel(activeDialect)}</span>
      </div>

      {canExplain && (
        <Button variant="ghost" size="sm" onClick={onExplain} disabled={isRunning || isExplaining} title="Show query execution plan">
          {isExplaining ? <Loader2 className="animate-spin" /> : <FileSearch />} Explain
        </Button>
      )}

      <Button
        variant={aiActive ? "secondary" : "ghost"}
        size="sm"
        onClick={onToggleAi}
        title="Toggle AI Assistant"
      >
        <Sparkles /> AI
      </Button>

      {typeof rowCount === "number" && (
        <span className="font-mono text-xs text-muted-foreground">
          {rowCount.toLocaleString()} rows
          {elapsedMs !== undefined && ` . ${formatDuration(elapsedMs)}`}
        </span>
      )}

      {hasStreamingRows && (
        <span className="animate-pulse font-mono text-xs text-primary">↓ {streamingRowsCount.toLocaleString()} rows streaming...</span>
      )}

      {(hasResult || hasStreamingRows) && (
        <Button variant="ghost" size="sm" className="ml-auto" onClick={onExport} title="Export results">
          <Download /> Export
        </Button>
      )}

      {showSaveInput ? (
        <form
          className={(hasResult || hasStreamingRows) ? "flex items-center gap-1" : "ml-auto flex items-center gap-1"}
          onSubmit={(e) => {
            e.preventDefault();
            onConfirmSave();
          }}
        >
          <Input
            autoFocus
            type="text"
            placeholder="Query name..."
            value={saveName}
            onChange={(e) => onSaveNameChange(e.target.value)}
            className="h-7 w-36 text-xs"
          />
          <Button type="submit" size="sm">Save</Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onCancelSave}
            aria-label="Cancel save"
            title="Cancel"
          >
            <X />
          </Button>
        </form>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className={hasResult || hasStreamingRows ? undefined : "ml-auto"}
          onClick={onOpenSave}
          title="Save query"
        >
          <Bookmark /> Save
        </Button>
      )}
    </div>
  );
}
