import React, { createContext, useContext, useMemo, useState } from "react";
import { QueryTab } from "../models/queryTab";

interface QueryTabsContextValue {
  tabs: QueryTab[];
  activeTabId: string;
  setActiveTabId: (id: string) => void;
  updateTabSql: (id: string, sql: string) => void;
  addTab: (title: string, sql: string) => string;
  closeTab: (id: string) => void;
}

const QueryTabsContext = createContext<QueryTabsContextValue | null>(null);

export function QueryTabsProvider({ children }: { children: React.ReactNode }) {
  const [tabs, setTabs] = useState<QueryTab[]>([
    { id: crypto.randomUUID(), title: "SQLQuery1", sql: "" },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>(() => tabs[0].id);

  const updateTabSql = (id: string, sql: string) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, sql } : t)));
  };

  const addTab = (title: string, sql: string) => {
    const id = crypto.randomUUID();
    setTabs((prev) => [...prev, { id, title, sql }]);
    setActiveTabId(id);
    return id;
  };

  const closeTab = (id: string) => {
    setTabs((prev) => {
      if (prev.length <= 1) return prev;
      const currentIndex = prev.findIndex((t) => t.id === id);
      const next = prev.filter((t) => t.id !== id);
      if (id === activeTabId) {
        const fallback = next[Math.max(0, currentIndex - 1)] ?? next[0];
        if (fallback) setActiveTabId(fallback.id);
      }
      return next;
    });
  };

  const value = useMemo(
    () => ({ tabs, activeTabId, setActiveTabId, updateTabSql, addTab, closeTab }),
    [tabs, activeTabId],
  );

  return <QueryTabsContext.Provider value={value}>{children}</QueryTabsContext.Provider>;
}

export function useQueryTabsContext() {
  const ctx = useContext(QueryTabsContext);
  if (!ctx) {
    throw new Error("useQueryTabsContext must be used within QueryTabsProvider");
  }
  return ctx;
}
