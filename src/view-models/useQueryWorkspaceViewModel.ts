import { useEffect, useMemo, useRef, useState } from "react";
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
import { useDatabaseState } from "../state/databaseStore";
import { useDatasetCollectionState, useDatasetMetadataState } from "../state/datasetStore";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { buildSelectAll, formatSql, getDefaultSqlForDialect, sanitizeSqlIdentifier, SqlDialect } from "../utils/sql";
import { useQueryTabsMeta, useQueryTabsSql } from "../context/QueryTabsContext";

function createTabTitle(index: number): string {
  return `SQLQuery${index}`;
}

function parseDatasetColumnsFromSchemaJson(schemaJson: string | null | undefined): string[] {
  if (!schemaJson) return [];
  try {
    const parsed = JSON.parse(schemaJson) as Array<{ name?: string }>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((field) => field?.name)
      .filter((name): name is string => typeof name === "string" && name.length > 0);
  } catch {
    return [];
  }
}

export function useQueryWorkspaceViewModel() {
  const { sql, setSql } = useQuerySqlStore();
  const { isRunning, result, error, streaming, isStreaming, explainPlan, isExplaining } = useQueryExecutionState();
  const { runQuery, runStreamingQuery, cancelQuery, clearError, runExplain } = useQueryExecutionActions();
  const { loadHistory } = useQueryHistoryStore();
  const { saveQuery } = useSavedQueriesStore();

  const { resultTab, setResultTab } = useResultTabState();
  const { connections, selectedConnectionId, tablesByConnection } = useDatabaseState();
  const { datasets, selectedId } = useDatasetCollectionState();
  const { schema } = useDatasetMetadataState();
  const { tabs, activeTabId, setActiveTabId, addTab, closeTab } = useQueryTabsMeta();
  const { updateTabSql, getTabSql } = useQueryTabsSql();

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
  const activeTabSql = activeTab ? getTabSql(activeTab.id) : "";

  useEffect(() => {
    if (tabs.length === 1 && !getTabSql(tabs[0].id)) {
      updateTabSql(tabs[0].id, sql);
    }
  }, [getTabSql, sql, tabs, updateTabSql]);

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
    if (activeTab) setSql(getTabSql(activeTab.id));
  }, [activeTab?.id, getTabSql, setSql]);

  useEffect(() => {
    if (activeTab && getTabSql(activeTab.id) !== sql) {
      updateTabSql(activeTab.id, sql);
    }
  }, [activeTab, getTabSql, sql, updateTabSql]);

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
      if (fallback) setSql(getTabSql(fallback.id));
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
    const queryText = selectedSql ?? activeTabSql ?? sql;
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

    for (const dataset of datasets) {
      const key = sanitizeSqlIdentifier(dataset.name);
      const parsedColumns = parseDatasetColumnsFromSchemaJson(dataset.schema_json);
      completion[key] = parsedColumns;
    }

    // Fallback to selected-dataset schema API response when schema_json is missing or empty.
    if (selectedDataset && schema?.fields?.length) {
      const key = sanitizeSqlIdentifier(selectedDataset.name);
      const existing = completion[key];
      if (!Array.isArray(existing) || existing.length === 0) {
        completion[key] = schema.fields.map((f) => f.name);
      }
    }

    return completion;
  }, [datasets, schema?.fields, selectedConnectionId, selectedDataset, tablesByConnection]);

  const sourceRecommendations = useMemo(() => {
    if (selectedConnectionId) return (tablesByConnection[selectedConnectionId] ?? []).slice(0, 12);
    return datasets.map((d) => sanitizeSqlIdentifier(d.name)).slice(0, 12);
  }, [datasets, selectedConnectionId, tablesByConnection]);

  const appendTemplate = (snippet: string) => {
    const currentSql = activeTabSql;
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
    activeTabSql,
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
