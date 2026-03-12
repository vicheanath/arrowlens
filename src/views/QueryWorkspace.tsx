import React from "react";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { sql as sqlLang } from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";
import { Play, X } from "lucide-react";
import { ExportModal } from "../components/ExportModal";
import { QueryEditorTabs } from "../components/query/QueryEditorTabs";
import { QueryToolbar } from "../components/query/QueryToolbar";
import { QuerySuggestionsBar } from "../features/query-workspace/components/QuerySuggestionsBar";
import { QueryResultPanel } from "../features/query-workspace/components/QueryResultPanel";
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
        canQuery={vm.canQuery}
        canStream={vm.canStream}
        canExplain={vm.canExplain}
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
        onFormat={() => vm.onEditorSqlChange(vm.formatSql(vm.activeTabSql ?? ""))}
        onInsertSelectTemplate={() => vm.appendTemplate("SELECT *\nFROM \"table_name\"\nLIMIT 100;")}
        onInsertCountTemplate={() => vm.appendTemplate("SELECT COUNT(*) AS total\nFROM \"table_name\";")}
      />

      <QuerySuggestionsBar
        sourceRecommendations={vm.sourceRecommendations}
        activeDialect={vm.activeDialect}
        appendTemplate={vm.appendTemplate}
        buildSelectAll={vm.buildSelectAll}
      />

      <div className="flex-shrink-0" style={{ height: 220 }}>
        <CodeMirror
          value={vm.activeTabSql ?? vm.sql}
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

      <QueryResultPanel
        hasCompletedResult={vm.hasCompletedResult}
        isRunning={vm.isRunning}
        displayColumns={vm.displayColumns}
        displayRows={vm.displayRows}
        displayTypes={vm.displayTypes}
        filteredRows={vm.filteredRows}
        resultTab={vm.resultTab}
        explainPlan={vm.explainPlan}
        isExplaining={vm.isExplaining}
        filterText={vm.filterText}
        setFilterText={vm.setFilterText}
        setResultTab={vm.setResultTab}
        onExplainRerun={vm.onExplainRerun}
        tableAreaHeight={vm.tableAreaHeight}
      />

      {!vm.isRunning && !vm.hasCompletedResult && vm.displayRows.length === 0 && !vm.error && !vm.explainPlan && (
        <div className="flex-1 flex flex-col items-center justify-center text-text-muted gap-2">
          <Play size={32} className="opacity-20" />
          <p className="text-sm">Run a SQL query to see results</p>
          <p className="text-xs opacity-60">{getDialectLabel(vm.activeDialect)} dialect. Press Cmd+Enter to execute</p>
        </div>
      )}

      {vm.showExportModal && (
        <ExportModal
          sql={vm.activeTabSql ?? vm.sql}
          rowCount={vm.isStreaming ? vm.streaming.rows.length : vm.result?.row_count ?? 0}
          onClose={() => vm.setShowExportModal(false)}
        />
      )}
    </div>
  );
}
