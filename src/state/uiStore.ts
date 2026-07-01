import React, { createContext, useContext, useMemo, useState } from "react";

export type ActiveTab = "explorer" | "query" | "chart" | "history";
export type ResultTab =
  | "table"
  | "chart"
  | "analyzer"
  | "explain"
  | "schema_detail"
  | "schema_editor"
  | "er_diagram";

/** Result tabs that show the active source's schema rather than query output. */
export const SCHEMA_RESULT_TABS: ResultTab[] = [
  "schema_detail",
  "schema_editor",
  "er_diagram",
];

export function isSchemaResultTab(tab: ResultTab): boolean {
  return SCHEMA_RESULT_TABS.includes(tab);
}
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

/** Cross-component intent: ask the sidebar to open its "New Connection" form. */
interface OnboardingState {
  newConnectionNonce: number;
  requestNewConnection: () => void;
}

/** ALTER operations the schema editor can be deep-linked into. Mirrors
 * `AlterOperation["kind"]` in schemaDdl.ts. */
export type SchemaEditOperation =
  | "add_column"
  | "rename_column"
  | "drop_column"
  | "rename_table";

/** Cross-component intent: preselect a table/column in the schema editor. The
 * `nonce` lets the editor re-apply even when the same target is requested twice. */
export interface SchemaEditTarget {
  tableId: string;
  column?: string;
  operation?: SchemaEditOperation;
  nonce: number;
}

interface SchemaEditState {
  schemaEditTarget: SchemaEditTarget | null;
  requestSchemaEdit: (target: Omit<SchemaEditTarget, "nonce">) => void;
}

const ActiveTabContext = createContext<ActiveTabState | null>(null);
const ResultTabContext = createContext<ResultTabState | null>(null);
const SidebarContext = createContext<SidebarState | null>(null);
const CommandPaletteContext = createContext<CommandPaletteState | null>(null);
const FullQueryContext = createContext<FullQueryState | null>(null);
const OnboardingContext = createContext<OnboardingState | null>(null);
const SchemaEditContext = createContext<SchemaEditState | null>(null);

export function UiProvider({ children }: { children: React.ReactNode }) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("query");
  const [resultTab, setResultTab] = useState<ResultTab>("table");
  const [sidebarSection, setSidebarSection] = useState<SidebarSection>("datasets");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isFullQuery, setIsFullQuery] = useState(false);
  const [newConnectionNonce, setNewConnectionNonce] = useState(0);
  const [schemaEditTarget, setSchemaEditTarget] = useState<SchemaEditTarget | null>(null);

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

  const onboardingValue = useMemo(
    () => ({
      newConnectionNonce,
      requestNewConnection: () => setNewConnectionNonce((current) => current + 1),
    }),
    [newConnectionNonce],
  );

  const schemaEditValue = useMemo(
    () => ({
      schemaEditTarget,
      requestSchemaEdit: (target: Omit<SchemaEditTarget, "nonce">) =>
        setSchemaEditTarget((current) => ({ ...target, nonce: (current?.nonce ?? 0) + 1 })),
    }),
    [schemaEditTarget],
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
          React.createElement(
            FullQueryContext.Provider,
            { value: fullQueryValue },
            React.createElement(
              OnboardingContext.Provider,
              { value: onboardingValue },
              React.createElement(SchemaEditContext.Provider, { value: schemaEditValue }, children),
            ),
          ),
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

export function useOnboarding() {
  return useRequiredContext(OnboardingContext, "useOnboarding");
}

export function useSchemaEdit() {
  return useRequiredContext(SchemaEditContext, "useSchemaEdit");
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
