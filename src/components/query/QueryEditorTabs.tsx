import React from "react";
import { Plus, X } from "lucide-react";
import { cn } from "../../utils/formatters";
import { QueryTab } from "../../models/queryTab";

interface QueryEditorTabsProps {
  tabs: QueryTab[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onAddTab: () => void;
}

export function QueryEditorTabs({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onAddTab,
}: QueryEditorTabsProps) {
  return (
    <div className="flex-shrink-0 h-8 border-b border-border bg-surface-2 flex items-center overflow-x-auto">
      {tabs.map((tab) => {
        const active = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            className={cn(
              "group flex items-center min-w-[140px] max-w-[260px] h-full px-2 border-r border-border/60",
              active ? "bg-surface-1" : "bg-surface-2 hover:bg-surface-3"
            )}
          >
            <button
              className={cn(
                "flex-1 text-left text-xs truncate",
                active ? "text-text-primary" : "text-text-muted"
              )}
              onClick={() => onSelectTab(tab.id)}
              title={tab.title}
            >
              {tab.title}
            </button>
            {tabs.length > 1 && (
              <button
                className="ml-1 p-0.5 rounded text-text-muted hover:text-text-primary hover:bg-surface-4 opacity-0 group-hover:opacity-100"
                onClick={() => onCloseTab(tab.id)}
                title="Close tab"
              >
                <X size={12} />
              </button>
            )}
          </div>
        );
      })}
      <button
        onClick={onAddTab}
        className="h-full px-2 text-text-muted hover:text-text-primary hover:bg-surface-3 border-r border-border/60"
        title="New query tab"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
