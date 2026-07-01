import { useCallback, useEffect, useMemo, useRef } from "react";
import { QueryTab } from "../../models/queryTab";
import { SqlDialect } from "../../utils/sql";

function createTabTitle(index: number): string {
  return `SQLQuery${index}`;
}

interface UseWorkspaceSqlSessionArgs {
  sql: string;
  setSql: (sql: string) => void;
  activeDialect: SqlDialect;
  buildDefaultSql: () => Promise<string>;
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
  buildDefaultSql,
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

  // `getTabSql` changes identity on every tab edit. Read it through a ref so the
  // tab-switch effect below doesn't re-fire on edits — otherwise it ping-pongs
  // with the `sql ← tab` sync (effect below) and blows the update depth.
  const getTabSqlRef = useRef(getTabSql);
  getTabSqlRef.current = getTabSql;
  const didMountRef = useRef(false);

  useEffect(() => {
    if (tabs.length === 1 && !getTabSql(tabs[0].id)) {
      updateTabSql(tabs[0].id, sql);
    }
  }, [getTabSql, sql, tabs, updateTabSql]);

  // Load a tab's stored SQL into the editor only when the *active tab changes*
  // (a real tab switch), not on every keystroke. Skipping the first mount lets
  // the effect above seed the new tab from the restored `sql` instead of this
  // effect clobbering `sql` with the still-empty tab.
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (activeTab) setSql(getTabSqlRef.current(activeTab.id));
  }, [activeTab?.id, setSql]);

  useEffect(() => {
    if (activeTab && getTabSql(activeTab.id) !== sql) {
      updateTabSql(activeTab.id, sql);
    }
  }, [activeTab, getTabSql, sql, updateTabSql]);

  // Stable identity so the CodeMirror editor isn't reconfigured every render.
  const onEditorSqlChange = useCallback(
    (nextSql: string) => {
      if (!activeTab) return;
      updateTabSql(activeTab.id, nextSql);
      setSql(nextSql);
    },
    [activeTab, updateTabSql, setSql],
  );

  const createNewTab = () => {
    void (async () => {
      const initialSql = await buildDefaultSql();
      const id = addTab(createTabTitle(tabs.length + 1), initialSql);
      setActiveTabId(id);
    })();
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
