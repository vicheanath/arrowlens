import React, { createContext, useContext, useMemo, useState } from "react";
import { QueryTab } from "../models/queryTab";

interface QueryTabsMetaContextValue {
  tabs: QueryTab[];
  activeTabId: string;
  setActiveTabId: (id: string) => void;
  addTab: (title: string, sql: string) => string;
  closeTab: (id: string) => void;
}

interface QueryTabsSqlContextValue {
  updateTabSql: (id: string, sql: string) => void;
  getTabSql: (id: string) => string;
}

const QueryTabsMetaContext = createContext<QueryTabsMetaContextValue | null>(null);
const QueryTabsSqlContext = createContext<QueryTabsSqlContextValue | null>(null);

export function QueryTabsProvider({ children }: { children: React.ReactNode }) {
  const [tabs, setTabs] = useState<QueryTab[]>([
    { id: crypto.randomUUID(), title: "SQLQuery1" },
  ]);
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
      const currentIndex = prev.findIndex((t) => t.id === id);
      const next = prev.filter((t) => t.id !== id);
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

  const metaValue = useMemo(
    () => ({ tabs, activeTabId, setActiveTabId, addTab, closeTab }),
    [tabs, activeTabId],
  );

  const sqlValue = useMemo(
    () => ({
      updateTabSql,
      getTabSql: (id: string) => tabSqlById[id] ?? "",
    }),
    [tabSqlById],
  );

  return (
    <QueryTabsMetaContext.Provider value={metaValue}>
      <QueryTabsSqlContext.Provider value={sqlValue}>{children}</QueryTabsSqlContext.Provider>
    </QueryTabsMetaContext.Provider>
  );
}

function useRequiredTabsContext<T>(context: React.Context<T | null>, name: string): T {
  const value = useContext(context);
  if (!value) {
    throw new Error(`${name} must be used within QueryTabsProvider`);
  }
  return value;
}

export function useQueryTabsMeta() {
  return useRequiredTabsContext(QueryTabsMetaContext, "useQueryTabsMeta");
}

export function useQueryTabsSql() {
  return useRequiredTabsContext(QueryTabsSqlContext, "useQueryTabsSql");
}

export function useQueryTabsContext() {
  const meta = useQueryTabsMeta();
  const sql = useQueryTabsSql();
  return { ...meta, ...sql };
}
