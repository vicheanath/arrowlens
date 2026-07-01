import React from "react";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import {
  Database,
  Terminal,
  Clock,
  BarChart2,
  Command,
  Menu,
  Upload,
  Bookmark,
} from "lucide-react";
import { DatasetExplorer } from "./DatasetExplorer";
import { QueryWorkspace } from "./QueryWorkspace";
import { QueryHistoryView } from "./QueryHistoryView";
import { StatusBar } from "../components/StatusBar";
import { CommandPalette } from "../components/CommandPalette";
import { SavedQueriesPanel } from "../components/SavedQueriesPanel";
import { SidebarSection } from "../state/uiStore";
import { useMainLayoutViewModel } from "../view-models/useMainLayoutViewModel";
import { cn } from "../utils/formatters";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/ui/tooltip";

const NAV_ITEMS: { id: SidebarSection; icon: React.ReactNode; label: string }[] = [
  { id: "datasets", icon: <Database size={18} />, label: "Datasets" },
  { id: "history", icon: <Clock size={18} />, label: "History" },
  { id: "saved", icon: <Bookmark size={18} />, label: "Saved Queries" },
];

export function MainLayout() {
  const {
    isSidebarOpen,
    sidebarSection,
    setSidebarSection,
    toggleSidebar,
    openCommandPalette,
    handleImport,
  } = useMainLayoutViewModel();

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* Title bar */}
      <header className="flex-shrink-0 h-10 flex items-center justify-between gap-2 px-3 bg-card border-b border-border select-none">
        {/* Left: app name + sidebar toggle */}
        <div className="flex items-center gap-3">
          <button onClick={toggleSidebar} className="btn-ghost p-1" aria-label="Toggle sidebar" title="Toggle sidebar">
            <Menu size={15} />
          </button>
          <div className="flex items-center gap-1.5">
            <span className="text-primary font-bold text-sm tracking-tight">Arrow</span>
            <span className="text-foreground font-semibold text-sm tracking-tight">Lens</span>
          </div>
        </div>

        {/* Center: command palette trigger */}
        <button
          onClick={openCommandPalette}
          className="flex items-center gap-2 px-3 py-1 rounded bg-muted border border-border text-muted-foreground text-xs hover:border-border-strong hover:text-foreground/80 transition-colors"
          style={{ width: 220 }}
        >
          <Command size={12} />
          <span>Search commands…</span>
          <kbd className="ml-auto text-xs bg-accent px-1 rounded font-mono">⌘K</kbd>
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
        <nav className="flex-shrink-0 w-11 flex flex-col py-1 bg-card border-r border-border">
          <TooltipProvider delay={300}>
            {NAV_ITEMS.map((item) => (
              <Tooltip key={item.id}>
                <TooltipTrigger
                  render={
                    <button
                      onClick={() => {
                        setSidebarSection(item.id);
                        if (!isSidebarOpen) toggleSidebar();
                      }}
                      aria-label={item.label}
                      className={cn(
                        "relative flex justify-center py-3 border-l-2 outline-none transition-colors focus-visible:border-ring",
                        sidebarSection === item.id && isSidebarOpen
                          ? "text-foreground border-primary"
                          : "text-muted-foreground border-transparent hover:text-foreground/80 hover:bg-muted/50",
                      )}
                    >
                      {item.icon}
                    </button>
                  }
                />
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            ))}
          </TooltipProvider>
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
                className="bg-card border-r border-border overflow-hidden"
              >
                <div className="h-full overflow-y-auto">
                  {sidebarSection === "datasets" && <DatasetExplorer />}
                  {sidebarSection === "history" && (
                    <div className="flex flex-col h-full">
                      <div className="px-3 py-2 border-b border-border flex-shrink-0">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Query History
                        </span>
                      </div>
                      <div className="flex-1 overflow-y-auto">
                        <QueryHistoryView />
                      </div>
                    </div>
                  )}
                  {sidebarSection === "saved" && (
                    <div className="flex flex-col h-full">
                      <div className="px-3 py-2 border-b border-border flex-shrink-0">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Saved Queries
                        </span>
                      </div>
                      <SavedQueriesPanel />
                    </div>
                  )}
                </div>
              </Panel>
              <PanelResizeHandle className="w-1 hover:bg-primary/40 transition-colors cursor-col-resize bg-border/20" />
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
