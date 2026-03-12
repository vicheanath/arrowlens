import { create } from "zustand";

export type ActiveTab = "explorer" | "query" | "chart" | "history";
export type ResultTab = "table" | "chart";
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

export const useUiStore = create<UiState>((set) => ({
  activeTab: "query",
  resultTab: "table",
  sidebarSection: "datasets",
  isSidebarOpen: true,
  isCommandPaletteOpen: false,
  isFullQuery: false,
  theme: "dark",

  setActiveTab: (activeTab) => set({ activeTab }),
  setResultTab: (resultTab) => set({ resultTab }),
  setSidebarSection: (sidebarSection) => set({ sidebarSection }),
  toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
  openCommandPalette: () => set({ isCommandPaletteOpen: true }),
  closeCommandPalette: () => set({ isCommandPaletteOpen: false }),
  toggleCommandPalette: () =>
    set((s) => ({ isCommandPaletteOpen: !s.isCommandPaletteOpen })),
  toggleFullQuery: () => set((s) => ({ isFullQuery: !s.isFullQuery })),
}));
