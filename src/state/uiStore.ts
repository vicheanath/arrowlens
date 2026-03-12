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

interface ActiveTabState {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
}

interface ResultTabState {
  resultTab: ResultTab;
  setResultTab: (tab: ResultTab) => void;
}

interface SidebarState {
  sidebarSection: SidebarSection;
  isSidebarOpen: boolean;
  setSidebarSection: (section: SidebarSection) => void;
  toggleSidebar: () => void;
}

interface CommandPaletteState {
  isCommandPaletteOpen: boolean;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;
}

interface FullQueryState {
  isFullQuery: boolean;
  toggleFullQuery: () => void;
}

const ActiveTabContext = createContext<ActiveTabState | null>(null);
const ResultTabContext = createContext<ResultTabState | null>(null);
const SidebarContext = createContext<SidebarState | null>(null);
const CommandPaletteContext = createContext<CommandPaletteState | null>(null);
const FullQueryContext = createContext<FullQueryState | null>(null);

export function UiProvider({ children }: { children: React.ReactNode }) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("query");
  const [resultTab, setResultTab] = useState<ResultTab>("table");
  const [sidebarSection, setSidebarSection] = useState<SidebarSection>("datasets");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isFullQuery, setIsFullQuery] = useState(false);

  const activeTabValue = useMemo(
    () => ({ activeTab, setActiveTab }),
    [activeTab],
  );

  const resultTabValue = useMemo(
    () => ({ resultTab, setResultTab }),
    [resultTab],
  );

  const sidebarValue = useMemo(
    () => ({
      sidebarSection,
      isSidebarOpen,
      setSidebarSection,
      toggleSidebar: () => setIsSidebarOpen((current) => !current),
    }),
    [sidebarSection, isSidebarOpen],
  );

  const commandPaletteValue = useMemo(
    () => ({
      isCommandPaletteOpen,
      openCommandPalette: () => setIsCommandPaletteOpen(true),
      closeCommandPalette: () => setIsCommandPaletteOpen(false),
      toggleCommandPalette: () => setIsCommandPaletteOpen((current) => !current),
    }),
    [isCommandPaletteOpen],
  );

  const fullQueryValue = useMemo(
    () => ({
      isFullQuery,
      toggleFullQuery: () => setIsFullQuery((current) => !current),
    }),
    [isFullQuery],
  );

  return React.createElement(
    ActiveTabContext.Provider,
    { value: activeTabValue },
    React.createElement(
      ResultTabContext.Provider,
      { value: resultTabValue },
      React.createElement(
        SidebarContext.Provider,
        { value: sidebarValue },
        React.createElement(
          CommandPaletteContext.Provider,
          { value: commandPaletteValue },
          React.createElement(FullQueryContext.Provider, { value: fullQueryValue }, children),
        ),
      ),
    ),
  );
}

function useRequiredContext<T>(context: React.Context<T | null>, name: string): T {
  const value = useContext(context);
  if (!value) {
    throw new Error(`${name} must be used within UiProvider`);
  }
  return value;
}

export function useActiveTabState() {
  return useRequiredContext(ActiveTabContext, "useActiveTabState");
}

export function useResultTabState() {
  return useRequiredContext(ResultTabContext, "useResultTabState");
}

export function useSidebarState() {
  return useRequiredContext(SidebarContext, "useSidebarState");
}

export function useCommandPaletteState() {
  return useRequiredContext(CommandPaletteContext, "useCommandPaletteState");
}

export function useFullQueryState() {
  return useRequiredContext(FullQueryContext, "useFullQueryState");
}

export function useUiStore(): UiState {
  const { activeTab, setActiveTab } = useActiveTabState();
  const { resultTab, setResultTab } = useResultTabState();
  const { sidebarSection, isSidebarOpen, setSidebarSection, toggleSidebar } = useSidebarState();
  const { isCommandPaletteOpen, openCommandPalette, closeCommandPalette, toggleCommandPalette } = useCommandPaletteState();
  const { isFullQuery, toggleFullQuery } = useFullQueryState();

  return {
    activeTab,
    resultTab,
    sidebarSection,
    isSidebarOpen,
    isCommandPaletteOpen,
    isFullQuery,
    theme: "dark",
    setActiveTab,
    setResultTab,
    setSidebarSection,
    toggleSidebar,
    openCommandPalette,
    closeCommandPalette,
    toggleCommandPalette,
    toggleFullQuery,
  };
}
