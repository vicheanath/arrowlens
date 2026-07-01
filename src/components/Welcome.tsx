import React from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Sparkles, Database, FolderOpen, Server, Upload, Play, Loader2, Command } from "lucide-react";
import { useDatabaseActions, useDatabaseState } from "../state/databaseStore";
import { useDatasetActions, useDatasetCollectionState } from "../state/datasetStore";
import { useSidebarState, useOnboarding } from "../state/uiStore";
import { useToastStore } from "../utils/toast";
import { errorToMessage } from "../utils/errors";
import { prepareSampleDatabase } from "../services/fileService";
import { cn } from "../utils/formatters";

/**
 * First-run / empty workspace screen. When no datasets or connections exist it
 * guides the user to connect a database, open the bundled sample, or import a
 * file. Once a source exists it falls back to a lightweight "run a query" hint.
 */
export function Welcome() {
  const { connections } = useDatabaseState();
  const { connectSqliteDatabase } = useDatabaseActions();
  const { datasets } = useDatasetCollectionState();
  const { importDataset } = useDatasetActions();
  const { isSidebarOpen, setSidebarSection, toggleSidebar } = useSidebarState();
  const { requestNewConnection } = useOnboarding();
  const { addToast } = useToastStore();
  const [busy, setBusy] = React.useState<string | null>(null);

  const hasSources = connections.length > 0 || datasets.length > 0;

  const run = async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    try {
      await fn();
    } catch (e) {
      addToast({ type: "error", title: "Something went wrong", message: errorToMessage(e), duration: 6000 });
    } finally {
      setBusy(null);
    }
  };

  const openSample = () =>
    run("sample", async () => {
      const path = await prepareSampleDatabase();
      await connectSqliteDatabase(path, "Sakila (sample)");
    });

  const openSqliteFile = () =>
    run("sqlite", async () => {
      const selected = await open({
        multiple: false,
        filters: [{ name: "SQLite", extensions: ["db", "sqlite", "sqlite3"] }],
      });
      if (typeof selected === "string") await connectSqliteDatabase(selected);
    });

  const importFile = () =>
    run("import", async () => {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Data files", extensions: ["csv", "parquet", "json", "ndjson", "jsonl", "arrow"] }],
      });
      if (typeof selected === "string") await importDataset(selected);
    });

  const connectServer = () => {
    setSidebarSection("datasets");
    if (!isSidebarOpen) toggleSidebar();
    requestNewConnection();
  };

  if (hasSources) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
        <Play size={32} className="opacity-20" />
        <p className="text-sm">Run a SQL query to see results</p>
        <p className="text-xs opacity-60">
          Press <kbd className="rounded bg-accent px-1 font-mono">⌘↵</kbd> to execute
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center overflow-auto p-6">
      <div className="w-full max-w-2xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex items-center gap-1.5">
            <Sparkles size={20} className="text-primary" />
            <span className="text-xl font-bold tracking-tight text-primary">Arrow</span>
            <span className="text-xl font-semibold tracking-tight text-foreground">Lens</span>
          </div>
          <p className="max-w-md text-sm text-muted-foreground">
            Query databases and large local datasets with SQL, charts, and AI — all on your machine.
          </p>
        </div>

        {/* Start here — the fastest path to something on screen. */}
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Start here
        </p>
        <ActionCard
          icon={<Database size={18} />}
          title="Open the sample database"
          subtitle="Sakila — a ready-made SQLite movie-rental database. No setup, ~5 seconds."
          busy={busy === "sample"}
          disabled={busy !== null}
          accent
          onClick={openSample}
        />

        <p className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Or bring your own
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ActionCard
            icon={<FolderOpen size={18} />}
            title="SQLite file"
            subtitle="Open a local .db / .sqlite file"
            busy={busy === "sqlite"}
            disabled={busy !== null}
            onClick={openSqliteFile}
          />
          <ActionCard
            icon={<Server size={18} />}
            title="Database server"
            subtitle="Postgres, MySQL, or SQL Server"
            disabled={busy !== null}
            onClick={connectServer}
          />
          <ActionCard
            icon={<Upload size={18} />}
            title="Import a dataset"
            subtitle="CSV, Parquet, JSON, or Arrow"
            busy={busy === "import"}
            disabled={busy !== null}
            onClick={importFile}
          />
        </div>

        <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Command size={12} />
          <span>
            Press <kbd className="rounded bg-accent px-1 font-mono">⌘K</kbd> any time for commands
          </span>
        </div>
      </div>
    </div>
  );
}

function ActionCard({
  icon,
  title,
  subtitle,
  onClick,
  busy = false,
  disabled = false,
  accent = false,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        // Matches the Card primitive's surface (rounded-xl, ring) while staying a
        // real button for keyboard + screen-reader users.
        "group flex items-start gap-3 rounded-xl p-4 text-left ring-1 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
        accent
          ? "bg-primary/5 ring-primary/30 hover:bg-primary/10"
          : "bg-card ring-foreground/10 hover:bg-muted",
      )}
    >
      <div
        className={cn(
          "flex size-9 flex-shrink-0 items-center justify-center rounded-lg",
          accent ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground group-hover:text-foreground",
        )}
      >
        {busy ? <Loader2 size={18} className="animate-spin" /> : icon}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{title}</div>
        <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{subtitle}</div>
      </div>
    </button>
  );
}
