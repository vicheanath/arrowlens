import { useCallback } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useCommandPaletteState, useSidebarState } from "../state/uiStore";
import { useDatasetActions } from "../state/datasetStore";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";

export function useMainLayoutViewModel() {
  const { isSidebarOpen, sidebarSection, setSidebarSection, toggleSidebar } = useSidebarState();
  const { openCommandPalette } = useCommandPaletteState();
  const { importDataset } = useDatasetActions();

  useKeyboardShortcuts([
    { key: "k", meta: true, handler: () => openCommandPalette() },
    { key: "b", meta: true, handler: () => toggleSidebar() },
  ]);

  const handleImport = useCallback(async () => {
    try {
      const file = await openDialog({
        multiple: false,
        filters: [{ name: "Data Files", extensions: ["csv", "parquet", "json", "ndjson", "jsonl", "arrow"] }],
      });
      if (typeof file === "string") await importDataset(file);
    } catch (e) {
      console.error("Import cancelled", e);
    }
  }, [importDataset]);

  return {
    isSidebarOpen,
    sidebarSection,
    setSidebarSection,
    toggleSidebar,
    openCommandPalette,
    handleImport,
  };
}
