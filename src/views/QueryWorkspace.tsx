import React, { useEffect, useRef } from "react";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import {
  sql as sqlLang,
  StandardSQL,
  SQLite,
  MySQL,
  PostgreSQL,
} from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";
import {
  Play,
  Zap,
  Clock,
  Bookmark,
  ChevronDown,
  Loader2,
  X,
  BarChart2,
  Table,
  Database,
} from "lucide-react";
import { useQueryStore } from "../state/queryStore";
import { useUiStore } from "../state/uiStore";
import { useDatabaseStore } from "../state/databaseStore";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { formatDate, formatDuration, cn } from "../utils/formatters";
import { VirtualTable } from "../components/VirtualTable";
import { ChartBuilder } from "../components/ChartBuilder";
import { getDefaultSqlForDialect, getDialectLabel, SqlDialect } from "../utils/sql";

export function QueryWorkspace() {
  const {
    sql,
    setSql,
    isRunning,
    result,
    error,
    history,
    streaming,
    isStreaming,
    runQuery,
    runStreamingQuery,
    cancelQuery,
    loadHistory,
    clearError,
  } = useQueryStore();

  const { resultTab, setResultTab } = useUiStore();
  const { connections, selectedConnectionId } = useDatabaseStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = React.useState(400);

  const selectedConnection =
    connections.find((connection) => connection.id === selectedConnectionId) ?? null;
  const activeDialect: SqlDialect = selectedConnection?.database_type ?? "datafusion";
  const activeSourceLabel = selectedConnection
    ? `${selectedConnection.name}`
    : "Local datasets";

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setContainerHeight(el.clientHeight);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useKeyboardShortcuts([
    { key: "Enter", meta: true, handler: () => runQuery() },
    { key: "Enter", meta: true, shift: true, handler: () => runStreamingQuery() },
  ]);

  const displayRows = isStreaming ? streaming.rows : (result?.rows ?? []);
  const displayColumns = isStreaming ? streaming.columns : (result?.columns ?? []);
  const displayTypes = isStreaming ? [] : (result?.column_types ?? []);

  const dialectConfig =
    activeDialect === "sqlite"
      ? SQLite
      : activeDialect === "mysql"
        ? MySQL
        : activeDialect === "postgres"
          ? PostgreSQL
          : StandardSQL;

  const editorExtensions = [
    sqlLang({ dialect: dialectConfig, upperCaseKeywords: true }),
    EditorView.lineWrapping,
  ];

  const tableAreaHeight = Math.max(200, containerHeight - 280);

  return (
    <div ref={containerRef} className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-border bg-surface-2">
        <button
          onClick={runQuery}
          disabled={isRunning}
          className="btn-primary text-xs flex items-center gap-1.5"
          title="Run Query (⌘↵)"
        >
          {isRunning ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
          Run
        </button>

        <button
          onClick={runStreamingQuery}
          disabled={isRunning}
          className="btn-ghost text-xs flex items-center gap-1.5 text-accent-teal"
          title="Run Streaming (⌘⇧↵)"
        >
          <Zap size={13} />
          Stream
        </button>

        {isRunning && (
          <button onClick={cancelQuery} className="btn-ghost text-xs text-accent-red">
            <X size={13} />
            Cancel
          </button>
        )}

        <div className="h-4 w-px bg-border ml-1" />

        <div className="flex items-center gap-1 rounded bg-surface-3 px-2 py-1 text-[11px] text-text-muted">
          <Database size={11} />
          <span className="text-text-secondary">{activeSourceLabel}</span>
          <span className="opacity-50">·</span>
          <span>{getDialectLabel(activeDialect)}</span>
        </div>

        {result && (
          <span className="text-xs text-text-muted font-mono">
            {result.row_count.toLocaleString()} rows
            {result.elapsed_ms !== undefined && ` · ${formatDuration(result.elapsed_ms)}`}
          </span>
        )}

        {isStreaming && streaming.rows.length > 0 && (
          <span className="text-xs text-accent-teal font-mono animate-pulse">
            ↓ {streaming.rows.length.toLocaleString()} rows streaming…
          </span>
        )}
      </div>

      {/* SQL Editor */}
      <div className="flex-shrink-0" style={{ height: 220 }}>
        <CodeMirror
          value={sql}
          onChange={setSql}
          extensions={editorExtensions}
          theme={oneDark}
          height="220px"
          placeholder={getDefaultSqlForDialect(activeDialect)}
          style={{
            fontSize: 13,
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
          }}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLineGutter: true,
            highlightSpecialChars: true,
            history: true,
            foldGutter: true,
            drawSelection: true,
            dropCursor: true,
            allowMultipleSelections: true,
            indentOnInput: true,
            syntaxHighlighting: true,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: true,
            rectangularSelection: true,
            crosshairCursor: false,
            highlightActiveLine: true,
            highlightSelectionMatches: true,
          }}
        />
      </div>

      {/* Error display */}
      {error && (
        <div className="flex-shrink-0 flex items-start gap-2 px-3 py-2 bg-accent-red/10 border-b border-accent-red/30 text-accent-red text-xs">
          <span className="flex-1 font-mono">{error}</span>
          <button onClick={clearError} className="flex-shrink-0 hover:opacity-80">
            <X size={12} />
          </button>
        </div>
      )}

      {/* Results area */}
      {(displayRows.length > 0 || isRunning) && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Result tabs */}
          <div className="flex-shrink-0 flex items-center gap-0 border-b border-border bg-surface-1 px-2">
            <button
              onClick={() => setResultTab("table")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 transition-colors",
                resultTab === "table"
                  ? "border-accent-blue text-accent-blue"
                  : "border-transparent text-text-muted hover:text-text-secondary"
              )}
            >
              <Table size={12} />
              Table
              {displayRows.length > 0 && (
                <span className="ml-1 text-text-muted">
                  ({displayRows.length.toLocaleString()})
                </span>
              )}
            </button>
            <button
              onClick={() => setResultTab("chart")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 transition-colors",
                resultTab === "chart"
                  ? "border-accent-blue text-accent-blue"
                  : "border-transparent text-text-muted hover:text-text-secondary"
              )}
            >
              <BarChart2 size={12} />
              Chart
            </button>
          </div>

          {/* Table or Chart */}
          <div className="flex-1 overflow-hidden min-h-0">
            {resultTab === "table" && (
              <div className="overflow-x-auto h-full">
                <VirtualTable
                  columns={displayColumns}
                  columnTypes={displayTypes}
                  rows={displayRows}
                  height={tableAreaHeight}
                  className="h-full"
                />
              </div>
            )}
            {resultTab === "chart" && (
              <ChartBuilder
                columns={displayColumns}
                columnTypes={displayTypes}
                rows={displayRows}
                className="h-full p-2"
              />
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isRunning && displayRows.length === 0 && !error && (
        <div className="flex-1 flex flex-col items-center justify-center text-text-muted gap-2">
          <Play size={32} className="opacity-20" />
          <p className="text-sm">Run a SQL query to see results</p>
          <p className="text-xs opacity-60">{getDialectLabel(activeDialect)} dialect · Press ⌘↵ to execute</p>
        </div>
      )}
    </div>
  );
}
