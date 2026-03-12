import { useEffect, useRef, useState } from "react";
import { EditorView } from "@uiw/react-codemirror";
import { StandardSQL, SQLite, MySQL, PostgreSQL } from "@codemirror/lang-sql";
import {
  useQueryExecutionActions,
  useQueryExecutionState,
  useQueryHistoryStore,
  useQuerySqlStore,
  useSavedQueriesStore,
} from "../state/queryStore";
import { useResultTabState } from "../state/uiStore";
import { buildSelectAll, formatSql, getDefaultSqlForDialect } from "../utils/sql";
import { buildCountSql, buildSelectAllSql, buildWorkspaceDefaultSql } from "../services/sqlTemplateService";
import { useSourceCatalog } from "../features/source-catalog";
import { useWorkspaceSession } from "../features/workspace-session";
import { useQueryExecutionShortcuts, useWorkspaceSqlSession } from "../features/query-workspace";
import { useQueryResultPresentation } from "../features/query-results";

export function useQueryWorkspaceViewModel() {
  const { sql, setSql } = useQuerySqlStore();
  const { isRunning, result, error, streaming, isStreaming, explainPlan, isExplaining } = useQueryExecutionState();
  const { runQuery, runStreamingQuery, cancelQuery, clearError, runExplain } = useQueryExecutionActions();
  const { loadHistory } = useQueryHistoryStore();
  const { saveQuery } = useSavedQueriesStore();

  const { resultTab, setResultTab } = useResultTabState();
  const {
    activeDialect,
    activeSourceLabel,
    completionSchema,
    selectedConnectionId,
    canQuery,
    canStream,
    canExplain,
  } = useSourceCatalog();
  const { tabs, activeTabId, setActiveTabId, addTab, closeTab, updateTabSql, getTabSql } = useWorkspaceSession();

  const containerRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);

  const [containerHeight, setContainerHeight] = useState(400);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [filterText, setFilterText] = useState("");
  const [defaultSqlTemplate, setDefaultSqlTemplate] = useState("");

  useEffect(() => {
    let isMounted = true;

    void buildWorkspaceDefaultSql(selectedConnectionId)
      .then((nextTemplate) => {
        if (isMounted) setDefaultSqlTemplate(nextTemplate);
      })
      .catch(() => {
        if (isMounted) setDefaultSqlTemplate(getDefaultSqlForDialect(activeDialect));
      });

    return () => {
      isMounted = false;
    };
  }, [activeDialect, selectedConnectionId]);

  const {
    activeTab,
    activeTabSql,
    onEditorSqlChange,
    createNewTab,
    closeTabById,
  } = useWorkspaceSqlSession({
    sql,
    setSql,
    activeDialect,
    buildDefaultSql: () => buildWorkspaceDefaultSql(selectedConnectionId),
    tabs,
    activeTabId,
    setActiveTabId,
    addTab,
    closeTab,
    updateTabSql,
    getTabSql,
  });

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setContainerHeight(el.clientHeight);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { runWithSelectionFallback, runSelectedOnly, getSelectedSql } = useQueryExecutionShortcuts({
    editorViewRef,
    activeTabSql,
    sql,
    selectedConnectionId,
    runQuery,
    runStreamingQuery,
  });

  const {
    displayRows,
    displayColumns,
    displayTypes,
    filteredRows,
    tableAreaHeight,
    hasCompletedResult,
  } = useQueryResultPresentation({
    isStreaming,
    streaming,
    result,
    filterText,
    containerHeight,
  });

  const dialectConfig =
    activeDialect === "sqlite" ? SQLite : activeDialect === "mysql" ? MySQL : activeDialect === "postgres" ? PostgreSQL : StandardSQL;

  const appendTemplate = (snippet: string) => {
    const currentSql = activeTabSql;
    const prefix = currentSql.trim().length > 0 ? `${currentSql.trimEnd()}\n\n` : "";
    onEditorSqlChange(`${prefix}${snippet}`);
  };

  const insertSelectTemplate = async () => {
    const snippet = await buildSelectAllSql("table_name", selectedConnectionId, 100);
    appendTemplate(snippet);
  };

  const insertCountTemplate = async () => {
    const snippet = await buildCountSql("table_name", selectedConnectionId);
    appendTemplate(snippet);
  };

  return {
    sql,
    isRunning,
    result,
    error,
    streaming,
    isStreaming,
    explainPlan,
    isExplaining,
    resultTab,
    activeDialect,
    activeSourceLabel,
    selectedConnectionId,
    tabs,
    activeTabId,
    activeTab,
    activeTabSql,
    showExportModal,
    showSaveInput,
    saveName,
    filterText,
    filteredRows,
    displayRows,
    displayColumns,
    displayTypes,
    canQuery,
    canStream,
    canExplain,
    completionSchema,
    dialectConfig,
    defaultSqlTemplate,
    tableAreaHeight,
    hasCompletedResult,
    containerRef,
    editorViewRef,
    setResultTab,
    setShowExportModal,
    setShowSaveInput,
    setSaveName,
    setFilterText,
    setActiveTabId,
    clearError,
    saveQuery,
    cancelQuery,
    createNewTab,
    closeTabById,
    runSelectedOnly,
    runWithSelectionFallback,
    onEditorSqlChange,
    appendTemplate,
    insertSelectTemplate,
    insertCountTemplate,
    formatSql,
    buildSelectAll,
    onExplain: () => {
      const selectedSql = getSelectedSql();
      runExplain(false, selectedSql ?? activeTabSql ?? sql);
      setResultTab("explain");
    },
    onExplainRerun: (verbose: boolean) => {
      const selectedSql = getSelectedSql();
      runExplain(verbose, selectedSql ?? activeTabSql ?? sql);
      setResultTab("explain");
    },
  };
}
