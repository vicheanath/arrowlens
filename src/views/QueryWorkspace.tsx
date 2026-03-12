import React from "react";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { sql as sqlLang } from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";
import { Play, X, BarChart2, Table, FileSearch, Filter } from "lucide-react";
import { cn } from "../utils/formatters";
import { VirtualTable } from "../components/VirtualTable";
import { ChartBuilder } from "../components/ChartBuilder";
import { ExportModal } from "../components/ExportModal";
import { QueryEditorTabs } from "../components/query/QueryEditorTabs";
import { QueryToolbar } from "../components/query/QueryToolbar";
import { getDefaultSqlForDialect, getDialectLabel } from "../utils/sql";
import { useQueryWorkspaceViewModel } from "../view-models/useQueryWorkspaceViewModel";

export function QueryWorkspace() {
  const vm = useQueryWorkspaceViewModel();

  const editorExtensions = React.useMemo(() => {
    const config = {
      dialect: vm.dialectConfig,
      upperCaseKeywords: true,
      schema: vm.completionSchema,
    } as any;
    return [sqlLang(config), EditorView.lineWrapping];
  }, [vm.completionSchema, vm.dialectConfig]);

  return (
    <div ref={vm.containerRef} className="flex flex-col h-full overflow-hidden">
      <QueryEditorTabs
        tabs={vm.tabs}
        activeTabId={vm.activeTabId}
        onSelectTab={vm.setActiveTabId}
        onCloseTab={vm.closeTabById}
        onAddTab={vm.createNewTab}
      />

      <QueryToolbar
        isRunning={vm.isRunning}
        isExplaining={vm.isExplaining}
        hasResult={Boolean(vm.result)}
        hasStreamingRows={vm.isStreaming && vm.streaming.rows.length > 0}
        streamingRowsCount={vm.streaming.rows.length}
        selectedConnectionId={vm.selectedConnectionId}
        activeSourceLabel={vm.activeSourceLabel}
        activeDialect={vm.activeDialect}
        elapsedMs={vm.result?.elapsed_ms}
        rowCount={vm.result?.row_count}
        showSaveInput={vm.showSaveInput}
        saveName={vm.saveName}
        onSaveNameChange={vm.setSaveName}
        onOpenSave={() => vm.setShowSaveInput(true)}
        onCancelSave={() => vm.setShowSaveInput(false)}
        onConfirmSave={() => {
          if (!vm.saveName.trim()) return;
          vm.saveQuery(vm.saveName.trim());
          vm.setSaveName("");
          vm.setShowSaveInput(false);
        }}
        onRun={() => vm.runWithSelectionFallback(false)}
        onRunSelected={vm.runSelectedOnly}
        onStream={() => vm.runWithSelectionFallback(true)}
        onCancel={vm.cancelQuery}
        onExplain={vm.onExplain}
        onExport={() => vm.setShowExportModal(true)}
        onFormat={() => vm.onEditorSqlChange(vm.formatSql(vm.activeTab?.sql ?? ""))}
        onInsertSelectTemplate={() => vm.appendTemplate("SELECT *\nFROM \"table_name\"\nLIMIT 100;")}
        onInsertCountTemplate={() => vm.appendTemplate("SELECT COUNT(*) AS total\nFROM \"table_name\";")}
      />

      <div className="flex-shrink-0 border-b border-border/60 bg-surface-1 px-3 py-1.5">
        <div className="flex items-center gap-2 overflow-x-auto">
          <span className="text-[11px] text-text-muted whitespace-nowrap">Suggested sources:</span>
          {vm.sourceRecommendations.length === 0 && (
            <span className="text-[11px] text-text-muted/70">No schema loaded yet</span>
          )}
          {vm.sourceRecommendations.map((sourceName) => (
            <button
              key={sourceName}
              onClick={() => vm.appendTemplate(vm.buildSelectAll(sourceName, 100, vm.activeDialect))}
              className="px-2 py-0.5 rounded border border-border/70 text-[11px] text-text-secondary hover:bg-surface-3 whitespace-nowrap"
              title={`Insert SELECT for ${sourceName}`}
            >
              {sourceName}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-shrink-0" style={{ height: 220 }}>
        <CodeMirror
          value={vm.activeTab?.sql ?? vm.sql}
          onCreateEditor={(view) => {
            vm.editorViewRef.current = view;
          }}
          onChange={vm.onEditorSqlChange}
          extensions={editorExtensions}
          theme={oneDark}
          height="220px"
          placeholder={getDefaultSqlForDialect(vm.activeDialect)}
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

      {vm.error && (
        <div className="flex-shrink-0 flex items-start gap-2 px-3 py-2 bg-accent-red/10 border-b border-accent-red/30 text-accent-red text-xs">
          <span className="flex-1 font-mono">{vm.error}</span>
          <button onClick={vm.clearError} className="flex-shrink-0 hover:opacity-80">
            <X size={12} />
          </button>
        </div>
      )}

      {(vm.hasCompletedResult || vm.displayColumns.length > 0 || vm.displayRows.length > 0 || vm.isRunning || vm.explainPlan) && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-shrink-0 flex items-center gap-0 border-b border-border bg-surface-1 px-2">
            <button
              onClick={() => vm.setResultTab("table")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 transition-colors",
                vm.resultTab === "table"
                  ? "border-accent-blue text-accent-blue"
                  : "border-transparent text-text-muted hover:text-text-secondary",
              )}
            >
              <Table size={12} />
              Table
              {vm.displayRows.length > 0 && (
                <span className="ml-1 text-text-muted">
                  ({vm.filteredRows.length !== vm.displayRows.length
                    ? `${vm.filteredRows.length.toLocaleString()} / ${vm.displayRows.length.toLocaleString()}`
                    : vm.displayRows.length.toLocaleString()})
                </span>
              )}
            </button>
            <button
              onClick={() => vm.setResultTab("chart")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 transition-colors",
                vm.resultTab === "chart"
                  ? "border-accent-blue text-accent-blue"
                  : "border-transparent text-text-muted hover:text-text-secondary",
              )}
            >
              <BarChart2 size={12} />
              Chart
            </button>
            {vm.explainPlan && (
              <button
                onClick={() => vm.setResultTab("explain")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 transition-colors",
                  vm.resultTab === "explain"
                    ? "border-accent-mauve text-accent-mauve"
                    : "border-transparent text-text-muted hover:text-text-secondary",
                )}
              >
                <FileSearch size={12} />
                Explain
              </button>
            )}

            {vm.resultTab === "table" && vm.displayRows.length > 0 && (
              <div className="ml-auto flex items-center gap-1.5 px-2">
                <Filter size={11} className="text-text-muted" />
                <input
                  type="text"
                  placeholder="Filter rows..."
                  value={vm.filterText}
                  onChange={(e) => vm.setFilterText(e.target.value)}
                  className="text-xs bg-surface-3 border border-border rounded px-2 py-0.5 text-text-secondary placeholder:text-text-muted outline-none focus:border-accent-blue w-32"
                />
                {vm.filterText && (
                  <button onClick={() => vm.setFilterText("")} className="text-text-muted hover:text-text-primary">
                    <X size={11} />
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-hidden min-h-0">
            {vm.resultTab === "table" && (
              <div className="overflow-x-auto h-full">
                {vm.displayColumns.length > 0 ? (
                  <VirtualTable
                    columns={vm.displayColumns}
                    columnTypes={vm.displayTypes}
                    rows={vm.filteredRows}
                    height={vm.tableAreaHeight}
                    className="h-full"
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-text-muted text-sm">
                    Query completed with 0 rows returned.
                  </div>
                )}
              </div>
            )}
            {vm.resultTab === "chart" && (
              <ChartBuilder
                columns={vm.displayColumns}
                columnTypes={vm.displayTypes}
                rows={vm.displayRows}
                className="h-full p-2"
              />
            )}
            {vm.resultTab === "explain" && vm.explainPlan && (
              <div className="h-full overflow-auto p-4">
                <pre className="text-xs font-mono text-text-secondary whitespace-pre-wrap leading-5">
                  {vm.explainPlan}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {!vm.isRunning && !vm.hasCompletedResult && vm.displayRows.length === 0 && !vm.error && !vm.explainPlan && (
        <div className="flex-1 flex flex-col items-center justify-center text-text-muted gap-2">
          <Play size={32} className="opacity-20" />
          <p className="text-sm">Run a SQL query to see results</p>
          <p className="text-xs opacity-60">{getDialectLabel(vm.activeDialect)} dialect. Press Cmd+Enter to execute</p>
        </div>
      )}

      {vm.showExportModal && (
        <ExportModal
          sql={vm.activeTab?.sql ?? vm.sql}
          rowCount={vm.isStreaming ? vm.streaming.rows.length : vm.result?.row_count ?? 0}
          onClose={() => vm.setShowExportModal(false)}
        />
      )}
    </div>
  );
}
