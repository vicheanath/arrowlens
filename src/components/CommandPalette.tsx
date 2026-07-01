import React from "react";
import { Database, Play, Upload, Clock, FolderOpen, Save, Sparkles } from "lucide-react";
import { useCommandPaletteState } from "../state/uiStore";
import { useDatasetActions, useDatasetCollectionState } from "../state/datasetStore";
import { useDatabaseActions, useDatabaseState } from "../state/databaseStore";
import { useQueryExecutionActions, useQueryHistoryStore, useQuerySqlStore } from "../state/queryStore";
import { openSqlFile, saveSqlFile, prepareSampleDatabase } from "../services/fileService";
import { useToastStore } from "../utils/toast";
import { errorToMessage } from "../utils/errors";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";

interface CommandPaletteProps {
  onImportDataset: () => void;
}

export function CommandPalette({ onImportDataset }: CommandPaletteProps) {
  const { isCommandPaletteOpen, closeCommandPalette } = useCommandPaletteState();
  const { runQuery } = useQueryExecutionActions();
  const { history } = useQueryHistoryStore();
  const { sql, setSql } = useQuerySqlStore();
  const { datasets } = useDatasetCollectionState();
  const { selectDataset } = useDatasetActions();
  const { selectedConnectionId } = useDatabaseState();
  const { connectSqliteDatabase } = useDatabaseActions();
  const { addToast } = useToastStore();

  const handleLoadSample = React.useCallback(async () => {
    try {
      const path = await prepareSampleDatabase();
      await connectSqliteDatabase(path, "Sakila (sample)");
      addToast({ type: "success", title: "Sample database loaded", message: "Sakila (sample)" });
    } catch (e) {
      addToast({ type: "error", title: "Couldn't load sample", message: errorToMessage(e), duration: 6000 });
    }
  }, [connectSqliteDatabase, addToast]);

  // Latest SQL via a ref so the global shortcut handler doesn't re-bind on edit.
  const sqlRef = React.useRef(sql);
  sqlRef.current = sql;

  const handleOpenFile = React.useCallback(async () => {
    try {
      const result = await openSqlFile();
      if (result) {
        setSql(result.content);
        addToast({ type: "success", title: "Opened", message: result.path });
      }
    } catch (e) {
      addToast({ type: "error", title: "Open failed", message: errorToMessage(e), duration: 6000 });
    }
  }, [setSql, addToast]);

  const handleSaveFile = React.useCallback(async () => {
    try {
      const path = await saveSqlFile(sqlRef.current ?? "");
      if (path) addToast({ type: "success", title: "Saved", message: path });
    } catch (e) {
      addToast({ type: "error", title: "Save failed", message: errorToMessage(e), duration: 6000 });
    }
  }, [addToast]);

  // Global shortcuts: ⌘/Ctrl+S saves, ⌘/Ctrl+Shift+O opens. (⌘O is Import.)
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      const key = event.key.toLowerCase();
      if (key === "s" && !event.shiftKey) {
        event.preventDefault();
        void handleSaveFile();
      } else if (key === "o" && event.shiftKey) {
        event.preventDefault();
        void handleOpenFile();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSaveFile, handleOpenFile]);

  return (
    <CommandDialog
      open={isCommandPaletteOpen}
      onOpenChange={(open) => { if (!open) closeCommandPalette(); }}
    >
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Actions">
          <CommandItem
            value="load sample database sakila"
            onSelect={() => {
              closeCommandPalette();
              void handleLoadSample();
            }}
          >
            <Sparkles /> Load sample database
          </CommandItem>
          <CommandItem
            onSelect={() => {
              closeCommandPalette();
              onImportDataset();
            }}
          >
            <Upload /> Import Dataset
            <CommandShortcut>⌘O</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              closeCommandPalette();
              runQuery(selectedConnectionId);
            }}
          >
            <Play /> Run Query
            <CommandShortcut>⌘↵</CommandShortcut>
          </CommandItem>
          <CommandItem
            value="open sql file"
            onSelect={() => {
              closeCommandPalette();
              void handleOpenFile();
            }}
          >
            <FolderOpen /> Open SQL file…
            <CommandShortcut>⌘⇧O</CommandShortcut>
          </CommandItem>
          <CommandItem
            value="save sql file"
            onSelect={() => {
              closeCommandPalette();
              void handleSaveFile();
            }}
          >
            <Save /> Save SQL to file…
            <CommandShortcut>⌘S</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        {datasets.length > 0 && (
          <CommandGroup heading="Datasets">
            {datasets.map((ds) => (
              <CommandItem
                key={ds.id}
                value={`dataset ${ds.name}`}
                onSelect={() => {
                  closeCommandPalette();
                  selectDataset(ds.id);
                }}
              >
                <Database /> {ds.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {history.length > 0 && (
          <CommandGroup heading="Recent Queries">
            {history.slice(0, 5).map((h) => (
              <CommandItem
                key={h.id}
                value={`history ${h.id} ${h.sql}`}
                onSelect={() => {
                  closeCommandPalette();
                  setSql(h.sql);
                }}
              >
                <Clock /> {h.sql.slice(0, 60) + (h.sql.length > 60 ? "…" : "")}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
