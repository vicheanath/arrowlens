import React from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import {
  Database,
  Terminal,
  Clock,
  BarChart2,
  Command,
  Menu,
  Upload,
} from "lucide-react";
import { DatasetExplorer } from "./DatasetExplorer";
import { QueryWorkspace } from "./QueryWorkspace";
import { QueryHistoryView } from "./QueryHistoryView";
import { StatusBar } from "../components/StatusBar";
import { CommandPalette } from "../components/CommandPalette";
import { useUiStore, SidebarSection } from "../state/uiStore";
import { useDatasetStore } from "../state/datasetStore";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { cn } from "../utils/formatters";

const NAV_ITEMS: { id: SidebarSection; icon: React.ReactNode; label: string }[] = [
  { id: "datasets", icon: <Database size={18} />, label: "Datasets" },
  { id: "history", icon: <Clock size={18} />, label: "History" },
];

export function MainLayout() {
  const {
    isSidebarOpen,
    sidebarSection,
    setSidebarSection,
    toggleSidebar,
    openCommandPalette,
  } = useUiStore();

  const { importDataset } = useDatasetStore();

  useKeyboardShortcuts([
    { key: "k", meta: true, handler: () => openCommandPalette() },
    { key: "b", meta: true, handler: () => toggleSidebar() },
  ]);

  const handleImport = async () => {
    try {
      const file = await openDialog({
        multiple: false,
        filters: [
          {
            name: "Data Files",
            extensions: ["csv", "parquet", "json", "ndjson", "jsonl", "arrow"],
          },
        ],
      });
      if (typeof file === "string") {
        await importDataset(file);
      }
    } catch (e) {
      console.error("Import cancelled", e);
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-surface-0">
      {/* Title bar */}
      <header className="flex-shrink-0 h-10 flex items-center justify-between gap-2 px-3 bg-surface-1 border-b border-border select-none">
        {/* Left: app name + sidebar toggle */}
        <div className="flex items-center gap-3">
          <button onClick={toggleSidebar} className="btn-ghost p-1">
            <Menu size={15} />
          </button>
          <div className="flex items-center gap-1.5">
            <span className="text-accent-blue font-bold text-sm tracking-tight">Arrow</span>
            <span className="text-text-primary font-semibold text-sm tracking-tight">Lens</span>
          </div>
        </div>

        {/* Center: command palette trigger */}
        <button
          onClick={openCommandPalette}
          className="flex items-center gap-2 px-3 py-1 rounded bg-surface-3 border border-border text-text-muted text-xs hover:border-border-strong hover:text-text-secondary transition-colors"
          style={{ width: 220 }}
        >
          <Command size={12} />
          <span>Search commands…</span>
          <kbd className="ml-auto text-xs bg-surface-4 px-1 rounded font-mono">⌘K</kbd>
        </button>

        {/* Right: import */}
        <button onClick={handleImport} className="btn-primary text-xs flex items-center gap-1.5">
          <Upload size={13} />
          Import
        </button>
      </header>

      {/* Main area */}
      <div className="flex flex-1 min-h-0">
        {/* Activity bar */}
        <nav className="flex-shrink-0 w-10 flex flex-col items-center py-2 gap-1 bg-surface-1 border-r border-border">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setSidebarSection(item.id);
                if (!isSidebarOpen) toggleSidebar();
              }}
              className={cn(
                "p-2 rounded transition-colors",
                sidebarSection === item.id && isSidebarOpen
                  ? "text-accent-blue bg-accent-blue/10"
                  : "text-text-muted hover:text-text-secondary hover:bg-surface-4"
              )}
              title={item.label}
            >
              {item.icon}
            </button>
          ))}
        </nav>

        {/* Resizable layout: sidebar + main */}
        <PanelGroup direction="horizontal" className="flex-1 min-w-0">
          {/* Sidebar panel */}
          {isSidebarOpen && (
            <>
              <Panel
                defaultSize={22}
                minSize={15}
                maxSize={40}
                className="bg-surface-1 border-r border-border overflow-hidden"
              >
                <div className="h-full overflow-y-auto">
                  {sidebarSection === "datasets" && <DatasetExplorer />}
                  {sidebarSection === "history" && (
                    <div className="flex flex-col h-full">
                      <div className="px-3 py-2 border-b border-border flex-shrink-0">
                        <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                          Query History
                        </span>
                      </div>
                      <div className="flex-1 overflow-y-auto">
                        <QueryHistoryView />
                      </div>
                    </div>
                  )}
                </div>
              </Panel>
              <PanelResizeHandle className="w-1 hover:bg-accent-blue/40 transition-colors cursor-col-resize bg-border/20" />
            </>
          )}

          {/* Main editor panel */}
          <Panel minSize={40} className="overflow-hidden">
            <QueryWorkspace />
          </Panel>
        </PanelGroup>
      </div>

      {/* Status bar */}
      <StatusBar />

      {/* Command palette overlay */}
      <CommandPalette onImportDataset={handleImport} />
    </div>
  );
}
