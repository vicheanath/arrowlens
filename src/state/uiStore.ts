import React, { createContext, useContext, useMemo, useState } from "react";

export type ActiveTab = "explorer" | "query" | "chart" | "history";
export type ResultTab = "table" | "chart" | "explain";
export type SidebarSection = "datasets" | "history" | "saved";

interface UiState {
  activeTab: ActiveTab;
  resultTab: ResultTab;
  sidebarSection: SidebarSection;
  isSidebarOpen: boolean;
  isCommandPaletteOpen: boolean;
  isFullQuery: boolean;
  theme: "dark";

  setActiveTab: (tab: ActiveTab) => void;
  setResultTab: (tab: ResultTab) => void;
  setSidebarSection: (section: SidebarSection) => void;
  toggleSidebar: () => void;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;
  toggleFullQuery: () => void;
}

const UiContext = createContext<UiState | null>(null);

export function UiProvider({ children }: { children: React.ReactNode }) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("query");
  const [resultTab, setResultTab] = useState<ResultTab>("table");
  const [sidebarSection, setSidebarSection] = useState<SidebarSection>("datasets");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isFullQuery, setIsFullQuery] = useState(false);

  const value = useMemo(
    () => ({
      activeTab,
      resultTab,
      sidebarSection,
      isSidebarOpen,
      isCommandPaletteOpen,
      isFullQuery,
      theme: "dark" as const,
      setActiveTab,
      setResultTab,
      setSidebarSection,
      toggleSidebar: () => setIsSidebarOpen((current) => !current),
      openCommandPalette: () => setIsCommandPaletteOpen(true),
      closeCommandPalette: () => setIsCommandPaletteOpen(false),
      toggleCommandPalette: () => setIsCommandPaletteOpen((current) => !current),
      toggleFullQuery: () => setIsFullQuery((current) => !current),
    }),
    [activeTab, resultTab, sidebarSection, isSidebarOpen, isCommandPaletteOpen, isFullQuery],
  );

  return React.createElement(UiContext.Provider, { value }, children);
}

export function useUiStore() {
  const context = useContext(UiContext);
  if (!context) {
    throw new Error("useUiStore must be used within UiProvider");
  }
  return context;
}
