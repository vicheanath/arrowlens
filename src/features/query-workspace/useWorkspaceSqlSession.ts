import { useEffect, useMemo } from "react";
import { QueryTab } from "../../models/queryTab";
import { getDefaultSqlForDialect, SqlDialect } from "../../utils/sql";

function createTabTitle(index: number): string {
  return `SQLQuery${index}`;
}

interface UseWorkspaceSqlSessionArgs {
  sql: string;
  setSql: (sql: string) => void;
  activeDialect: SqlDialect;
  tabs: QueryTab[];
  activeTabId: string;
  setActiveTabId: (id: string) => void;
  addTab: (title: string, sql: string) => string;
  closeTab: (id: string) => void;
  updateTabSql: (id: string, sql: string) => void;
  getTabSql: (id: string) => string;
}

export function useWorkspaceSqlSession({
  sql,
  setSql,
  activeDialect,
  tabs,
  activeTabId,
  setActiveTabId,
  addTab,
  closeTab,
  updateTabSql,
  getTabSql,
}: UseWorkspaceSqlSessionArgs) {
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
      const fallback = tabs.find((tab) => tab.id !== id);
      if (fallback) setSql(getTabSql(fallback.id));
    }
  };

  return {
    activeTab,
    activeTabSql,
    onEditorSqlChange,
    createNewTab,
    closeTabById,
  };
}
