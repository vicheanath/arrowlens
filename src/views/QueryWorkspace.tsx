import React from "react";
import { EditorView } from "@uiw/react-codemirror";
import { ExportModal } from "../components/ExportModal";
import { QueryEditorTabs } from "../components/query/QueryEditorTabs";
import { QueryToolbar } from "../components/query/QueryToolbar";
import { SqlEditor } from "../components/query/SqlEditor";
import { AiFixBar } from "../features/query-workspace/components/AiFixBar";
import { QueryResultPanel } from "../features/query-workspace/components/QueryResultPanel";
import { AiPanel } from "../features/ai-assistant";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../components/ui/resizable";
import { useQueryWorkspaceViewModel } from "../view-models/useQueryWorkspaceViewModel";

export function QueryWorkspace() {
  const vm = useQueryWorkspaceViewModel();
  const [showAi, setShowAi] = React.useState(false);

  const editorLangConfig = React.useMemo(
    () => ({
      dialect: vm.dialectConfig,
      upperCaseKeywords: true,
      schema: vm.completionSchema,
      dialectName: vm.activeDialect,
    }),
    [vm.completionSchema, vm.dialectConfig, vm.activeDialect],
  );

  // Stable ref-setter — `editorViewRef` keeps the same identity across renders.
  const editorViewRef = vm.editorViewRef;
  const handleCreateEditor = React.useCallback(
    (view: EditorView) => {
      editorViewRef.current = view;
    },
    [editorViewRef],
  );

  return (
    <ResizablePanelGroup
      direction="horizontal"
      autoSaveId="arrowlens-workspace-horizontal"
      className="h-full overflow-hidden"
    >
      <ResizablePanel id="workspace-main" order={1} minSize={30} className="min-w-0">
      <div ref={vm.containerRef} className="flex flex-col h-full overflow-hidden min-w-0">
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
        onStream={() => vm.runWithSelectionFallback(true)}
        onCancel={vm.cancelQuery}
        onExplain={vm.onExplain}
        onExport={() => vm.setShowExportModal(true)}
        onFormat={() => vm.onEditorSqlChange(vm.formatSql(vm.activeTabSql ?? ""))}
        onInsertSelectTemplate={() => { void vm.insertSelectTemplate(); }}
        onInsertCountTemplate={() => { void vm.insertCountTemplate(); }}
        onToggleAi={() => setShowAi((value) => !value)}
        aiActive={showAi}
      />

      <ResizablePanelGroup
        direction="vertical"
        autoSaveId="arrowlens-editor-results"
        className="flex-1 min-h-0"
      >
        <ResizablePanel id="editor" order={1} defaultSize={32} minSize={12} className="min-h-0">
          <div className="h-full overflow-hidden">
            <SqlEditor
              value={vm.activeTabSql ?? vm.sql}
              onCreateEditor={handleCreateEditor}
              onChange={vm.onEditorSqlChange}
              langConfig={editorLangConfig}
              placeholder={vm.defaultSqlTemplate}
            />
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel id="results" order={2} defaultSize={68} minSize={15} className="flex flex-col min-h-0">
          {vm.error && (
            <AiFixBar
              error={vm.error}
              sql={vm.activeTabSql ?? vm.sql}
              connectionId={vm.selectedConnectionId}
              onApply={(fixed) => {
                vm.onEditorSqlChange(fixed);
                vm.clearError();
              }}
              onDismiss={vm.clearError}
            />
          )}

          <QueryResultPanel
            hasCompletedResult={vm.hasCompletedResult}
            isRunning={vm.isRunning}
            displayColumns={vm.displayColumns}
            displayRows={vm.displayRows}
            displayTypes={vm.displayTypes}
            filteredRows={vm.filteredRows}
            statementResults={vm.statementResults}
            truncated={vm.result?.truncated}
            resultTab={vm.resultTab}
            explainPlan={vm.explainPlan}
            isExplaining={vm.isExplaining}
            filterText={vm.filterText}
            setFilterText={vm.setFilterText}
            setResultTab={vm.setResultTab}
            onExplainRerun={vm.onExplainRerun}
            tableAreaHeight={vm.tableAreaHeight}
            onLoadMore={vm.onLoadMore}
            hasMoreRows={vm.hasMoreRows}
            isLoadingMoreRows={vm.isLoadingMoreRows}
          />
        </ResizablePanel>
      </ResizablePanelGroup>

      {vm.showExportModal && (
        <ExportModal
          sql={vm.activeTabSql ?? vm.sql}
          rowCount={vm.isStreaming ? vm.streaming.rows.length : vm.result?.row_count ?? 0}
          connectionId={vm.selectedConnectionId}
          onClose={() => vm.setShowExportModal(false)}
        />
      )}
      </div>
      </ResizablePanel>

      {showAi && (
        <>
          <ResizableHandle withHandle />
          <ResizablePanel id="ai" order={2} defaultSize={26} minSize={16} maxSize={50} className="min-w-0">
            <AiPanel
              connectionId={vm.selectedConnectionId}
              currentSql={vm.activeTabSql ?? vm.sql}
              onInsertSql={(sql) => vm.onEditorSqlChange(sql)}
              onClose={() => setShowAi(false)}
            />
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );
}
