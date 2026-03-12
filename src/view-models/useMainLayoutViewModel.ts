import { useCallback } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useUiStore } from "../state/uiStore";
import { useDatasetStore } from "../state/datasetStore";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";

export function useMainLayoutViewModel() {
  const { isSidebarOpen, sidebarSection, setSidebarSection, toggleSidebar, openCommandPalette } = useUiStore();
  const { importDataset } = useDatasetStore();

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
