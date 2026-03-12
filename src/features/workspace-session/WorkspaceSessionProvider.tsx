import React, { createContext, useContext, useMemo, useState } from "react";
import { QueryTab } from "../../models/queryTab";

interface WorkspaceSessionState {
  tabs: QueryTab[];
  activeTabId: string;
  setActiveTabId: (id: string) => void;
  addTab: (title: string, sql: string) => string;
  closeTab: (id: string) => void;
  updateTabSql: (id: string, sql: string) => void;
  getTabSql: (id: string) => string;
}

const WorkspaceSessionContext = createContext<WorkspaceSessionState | null>(null);

export function WorkspaceSessionProvider({ children }: { children: React.ReactNode }) {
  const [tabs, setTabs] = useState<QueryTab[]>([{ id: crypto.randomUUID(), title: "SQLQuery1" }]);
  const [activeTabId, setActiveTabId] = useState<string>(() => tabs[0].id);
  const [tabSqlById, setTabSqlById] = useState<Record<string, string>>(() => ({
    [tabs[0].id]: "",
  }));

  const updateTabSql = (id: string, sql: string) => {
    setTabSqlById((prev) => {
      if (prev[id] === sql) return prev;
      return { ...prev, [id]: sql };
    });
  };

  const addTab = (title: string, sql: string) => {
    const id = crypto.randomUUID();
    setTabs((prev) => [...prev, { id, title }]);
    setTabSqlById((prev) => ({ ...prev, [id]: sql }));
    setActiveTabId(id);
    return id;
  };

  const closeTab = (id: string) => {
    setTabs((prev) => {
      if (prev.length <= 1) return prev;
      const currentIndex = prev.findIndex((tab) => tab.id === id);
      const next = prev.filter((tab) => tab.id !== id);

      setTabSqlById((current) => {
        const { [id]: _removed, ...rest } = current;
        return rest;
      });

      if (id === activeTabId) {
        const fallback = next[Math.max(0, currentIndex - 1)] ?? next[0];
        if (fallback) setActiveTabId(fallback.id);
      }

      return next;
    });
  };

  const value = useMemo(
    () => ({
      tabs,
      activeTabId,
      setActiveTabId,
      addTab,
      closeTab,
      updateTabSql,
      getTabSql: (id: string) => tabSqlById[id] ?? "",
    }),
    [tabs, activeTabId, tabSqlById],
  );

  return <WorkspaceSessionContext.Provider value={value}>{children}</WorkspaceSessionContext.Provider>;
}

export function useWorkspaceSession() {
  const value = useContext(WorkspaceSessionContext);
  if (!value) {
    throw new Error("useWorkspaceSession must be used within WorkspaceSessionProvider");
  }
  return value;
}
