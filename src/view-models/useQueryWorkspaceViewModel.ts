import { useEffect, useMemo, useRef, useState } from "react";
import { EditorView } from "@uiw/react-codemirror";
import { StandardSQL, SQLite, MySQL, PostgreSQL } from "@codemirror/lang-sql";
import { useQueryStore } from "../state/queryStore";
import { useUiStore } from "../state/uiStore";
import { useDatabaseStore } from "../state/databaseStore";
import { useDatasetStore } from "../state/datasetStore";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { buildSelectAll, formatSql, getDefaultSqlForDialect, sanitizeSqlIdentifier, SqlDialect } from "../utils/sql";
import { useQueryTabsContext } from "../context/QueryTabsContext";

function createTabTitle(index: number): string {
  return `SQLQuery${index}`;
}

export function useQueryWorkspaceViewModel() {
  const {
    sql,
    setSql,
    isRunning,
    result,
    error,
    streaming,
    isStreaming,
    runQuery,
    runStreamingQuery,
    cancelQuery,
    loadHistory,
    clearError,
    saveQuery,
    explainPlan,
    isExplaining,
    runExplain,
  } = useQueryStore();

  const { resultTab, setResultTab } = useUiStore();
  const { connections, selectedConnectionId, tablesByConnection } = useDatabaseStore();
  const { datasets, selectedId, schema } = useDatasetStore();
  const { tabs, activeTabId, setActiveTabId, updateTabSql, addTab, closeTab } = useQueryTabsContext();

  const containerRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);

  const [containerHeight, setContainerHeight] = useState(400);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [filterText, setFilterText] = useState("");

  const selectedConnection = connections.find((c) => c.id === selectedConnectionId) ?? null;
  const activeDialect: SqlDialect = selectedConnection?.database_type ?? "datafusion";
  const activeSourceLabel = selectedConnection ? selectedConnection.name : "Local datasets";
  const selectedDataset = datasets.find((d) => d.id === selectedId) ?? null;

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0],
    [activeTabId, tabs],
  );

  useEffect(() => {
    if (tabs.length === 1 && !tabs[0].sql) {
      updateTabSql(tabs[0].id, sql);
    }
  }, []);

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

  useEffect(() => {
    if (activeTab) setSql(activeTab.sql);
  }, [activeTab?.id]);

  useEffect(() => {
    if (activeTab && activeTab.sql !== sql) {
      updateTabSql(activeTab.id, sql);
    }
  }, [activeTab, sql, updateTabSql]);

  const onEditorSqlChange = (nextSql: string) => {
    if (!activeTab) return;
    updateTabSql(activeTab.id, nextSql);
    setSql(nextSql);
  };

  const createNewTab = () => {
    const id = addTab(createTabTitle(tabs.length + 1), getDefaultSqlForDialect(activeDialect));
    setActiveTabId(id);
  };

  const closeTabById = (id: string) => {
    const closingActive = id === activeTabId;
    closeTab(id);
    if (closingActive) {
      const fallback = tabs.find((t) => t.id !== id);
      if (fallback) setSql(fallback.sql);
    }
  };

  const getSelectedSql = (): string | null => {
    const view = editorViewRef.current;
    if (!view) return null;
    const selection = view.state.selection.main;
    if (selection.empty) return null;
    const selected = view.state.sliceDoc(selection.from, selection.to).trim();
    return selected.length > 0 ? selected : null;
  };

  const runWithSelectionFallback = (streamingMode: boolean) => {
    const selectedSql = getSelectedSql();
    const queryText = selectedSql ?? activeTab?.sql ?? sql;
    if (streamingMode) runStreamingQuery(selectedConnectionId, queryText);
    else runQuery(selectedConnectionId, queryText);
  };

  const runSelectedOnly = () => {
    const selectedSql = getSelectedSql();
    if (!selectedSql) return;
    runQuery(selectedConnectionId, selectedSql);
  };

  useKeyboardShortcuts([
    { key: "Enter", meta: true, handler: () => runWithSelectionFallback(false) },
    { key: "Enter", meta: true, shift: true, handler: () => runWithSelectionFallback(true) },
  ]);

  const displayRows = isStreaming ? streaming.rows : result?.rows ?? [];
  const displayColumns = isStreaming ? streaming.columns : result?.columns ?? [];
  const displayTypes = isStreaming ? [] : result?.column_types ?? [];

  const filteredRows = useMemo(() => {
    if (!filterText.trim()) return displayRows;
    const needle = filterText.toLowerCase();
    return displayRows.filter((row) => row.some((cell) => String(cell ?? "").toLowerCase().includes(needle)));
  }, [displayRows, filterText]);

  const dialectConfig =
    activeDialect === "sqlite" ? SQLite : activeDialect === "mysql" ? MySQL : activeDialect === "postgres" ? PostgreSQL : StandardSQL;

  const completionSchema = useMemo(() => {
    const completion: Record<string, unknown> = {};

    if (selectedConnectionId) {
      const tables = tablesByConnection[selectedConnectionId] ?? [];
      for (const tableName of tables) {
        const parts = tableName.split(".");
        if (parts.length > 1) {
          const schemaName = parts[0];
          const relationName = parts.slice(1).join(".");
          const schemaBucket = (completion[schemaName] as Record<string, string[]> | undefined) ?? {};
          schemaBucket[relationName] = schemaBucket[relationName] ?? [];
          completion[schemaName] = schemaBucket;
        } else {
          completion[tableName] = [];
        }
      }
      return completion;
    }

    for (const dataset of datasets) completion[sanitizeSqlIdentifier(dataset.name)] = [];
    if (selectedDataset && schema?.fields?.length) completion[sanitizeSqlIdentifier(selectedDataset.name)] = schema.fields.map((f) => f.name);
    return completion;
  }, [datasets, schema?.fields, selectedConnectionId, selectedDataset, tablesByConnection]);

  const sourceRecommendations = useMemo(() => {
    if (selectedConnectionId) return (tablesByConnection[selectedConnectionId] ?? []).slice(0, 12);
    return datasets.map((d) => sanitizeSqlIdentifier(d.name)).slice(0, 12);
  }, [datasets, selectedConnectionId, tablesByConnection]);

  const appendTemplate = (snippet: string) => {
    const currentSql = activeTab?.sql ?? "";
    const prefix = currentSql.trim().length > 0 ? `${currentSql.trimEnd()}\n\n` : "";
    onEditorSqlChange(`${prefix}${snippet}`);
  };

  const tableAreaHeight = Math.max(200, containerHeight - 320);
  const hasCompletedResult = Boolean(result) || (isStreaming && streaming.isDone);

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
    showExportModal,
    showSaveInput,
    saveName,
    filterText,
    filteredRows,
    displayRows,
    displayColumns,
    displayTypes,
    sourceRecommendations,
    completionSchema,
    dialectConfig,
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
    formatSql,
    buildSelectAll,
    onExplain: () => {
      const selectedSql = getSelectedSql();
      runExplain(false, selectedSql ?? activeTab?.sql ?? sql);
      setResultTab("explain");
    },
  };
}
