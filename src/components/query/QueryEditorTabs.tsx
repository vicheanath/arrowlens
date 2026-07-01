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
    <div className="flex-shrink-0 h-8 border-b border-border bg-card flex items-center overflow-x-auto">
      {tabs.map((tab) => {
        const active = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            className={cn(
              "group flex items-center min-w-[140px] max-w-[260px] h-full px-2 border-r border-border/60",
              active ? "bg-card" : "bg-card hover:bg-muted"
            )}
          >
            <button
              type="button"
              className={cn(
                "flex-1 text-left text-xs truncate outline-none focus-visible:text-foreground",
                active ? "text-foreground" : "text-muted-foreground"
              )}
              onClick={() => onSelectTab(tab.id)}
              title={tab.title}
              aria-current={active ? "true" : undefined}
            >
              {tab.title}
            </button>
            {tabs.length > 1 && (
              <button
                type="button"
                className="ml-1 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-1 focus-visible:outline-ring"
                onClick={() => onCloseTab(tab.id)}
                title="Close tab"
                aria-label={`Close ${tab.title}`}
              >
                <X size={12} />
              </button>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={onAddTab}
        className="h-full px-2 text-muted-foreground hover:text-foreground hover:bg-muted border-r border-border/60 outline-none focus-visible:outline-1 focus-visible:outline-ring"
        title="New query tab"
        aria-label="New query tab"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
