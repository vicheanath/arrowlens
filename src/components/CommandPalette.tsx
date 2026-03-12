import React, { useEffect } from "react";
import { Command } from "cmdk";
import {
  Database,
  Play,
  Upload,
  Clock,
  BookOpen,
  X,
  BarChart2,
} from "lucide-react";
import { useUiStore, useQueryStore, useDatasetStore } from "../state/store";
import { cn } from "../utils/formatters";

interface CommandPaletteProps {
  onImportDataset: () => void;
}

export function CommandPalette({ onImportDataset }: CommandPaletteProps) {
  const { isCommandPaletteOpen, closeCommandPalette } = useUiStore();
  const { runQuery, history, setSql } = useQueryStore();
  const { datasets, selectDataset } = useDatasetStore();

  useEffect(() => {
    if (!isCommandPaletteOpen) return;
    const down = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCommandPalette();
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [isCommandPaletteOpen, closeCommandPalette]);

  if (!isCommandPaletteOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm"
      onClick={() => closeCommandPalette()}
    >
      <div
        className="w-full max-w-xl bg-surface-2 rounded-xl border border-border shadow-tooltip overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <Command label="Command Menu" className="text-text-primary">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              className="text-text-muted flex-shrink-0"
              fill="currentColor"
            >
              <path d="M3.5 2a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM1 3.5a2.5 2.5 0 115 0 2.5 2.5 0 01-5 0zM12.5 2a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM10 3.5a2.5 2.5 0 115 0 2.5 2.5 0 01-5 0zM3.5 11a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM1 12.5a2.5 2.5 0 115 0 2.5 2.5 0 01-5 0z" />
            </svg>
            <Command.Input
              placeholder="Type a command or search…"
              className="flex-1 bg-transparent text-text-primary placeholder:text-text-muted outline-none text-sm"
              autoFocus
            />
            <button onClick={closeCommandPalette} className="btn-ghost p-1 rounded">
              <X size={14} />
            </button>
          </div>

          <Command.List className="max-h-80 overflow-y-auto py-2">
            <Command.Empty className="py-6 text-center text-sm text-text-muted">
              No results found.
            </Command.Empty>

            <Command.Group heading="Actions" className="px-2">
              <CommandItem
                icon={<Upload size={14} />}
                label="Import Dataset"
                shortcut="⌘O"
                onSelect={() => {
                  closeCommandPalette();
                  onImportDataset();
                }}
              />
              <CommandItem
                icon={<Play size={14} />}
                label="Run Query"
                shortcut="⌘↵"
                onSelect={() => {
                  closeCommandPalette();
                  runQuery();
                }}
              />
            </Command.Group>

            {datasets.length > 0 && (
              <Command.Group heading="Datasets" className="px-2 mt-2">
                {datasets.map((ds) => (
                  <CommandItem
                    key={ds.id}
                    icon={<Database size={14} />}
                    label={ds.name}
                    onSelect={() => {
                      closeCommandPalette();
                      selectDataset(ds.id);
                    }}
                  />
                ))}
              </Command.Group>
            )}

            {history.length > 0 && (
              <Command.Group heading="Recent Queries" className="px-2 mt-2">
                {history.slice(0, 5).map((h) => (
                  <CommandItem
                    key={h.id}
                    icon={<Clock size={14} />}
                    label={h.sql.slice(0, 60) + (h.sql.length > 60 ? "…" : "")}
                    onSelect={() => {
                      closeCommandPalette();
                      setSql(h.sql);
                    }}
                  />
                ))}
              </Command.Group>
            )}
          </Command.List>

          <div className="border-t border-border px-4 py-2 flex items-center gap-4 text-xs text-text-muted">
            <span>↑↓ navigate</span>
            <span>↵ select</span>
            <span>Esc close</span>
          </div>
        </Command>
      </div>
    </div>
  );
}

interface CommandItemProps {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onSelect: () => void;
}

function CommandItem({ icon, label, shortcut, onSelect }: CommandItemProps) {
  return (
    <Command.Item
      value={label}
      onSelect={onSelect}
      className={cn(
        "flex items-center gap-2.5 px-3 py-2 rounded text-sm cursor-pointer",
        "text-text-secondary",
        "aria-selected:bg-surface-4 aria-selected:text-text-primary",
        "transition-colors"
      )}
    >
      <span className="text-text-muted">{icon}</span>
      <span className="flex-1">{label}</span>
      {shortcut && (
        <kbd className="text-xs text-text-muted bg-surface-4 px-1.5 py-0.5 rounded font-mono">
          {shortcut}
        </kbd>
      )}
    </Command.Item>
  );
}
