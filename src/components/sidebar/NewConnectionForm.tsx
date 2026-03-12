import React from "react";
import { Database, FolderOpen, X } from "lucide-react";
import { cn } from "../../utils/formatters";
import { DatabaseType } from "../../models/database";
import { LoadingSpinner } from "../LoadingSpinner";
import { IconBtn, DB_META } from "./SidebarPrimitives";

export interface NewConnectionFormProps {
  dbType: DatabaseType;
  dbName: string;
  dbConnString: string;
  isLoading: boolean;
  onDbTypeChange: (type: DatabaseType) => void;
  onDbNameChange: (name: string) => void;
  onDbConnStringChange: (connStr: string) => void;
  onConnect: () => void;
  onCancel: () => void;
}

export function NewConnectionForm({
  dbType,
  dbName,
  dbConnString,
  isLoading,
  onDbTypeChange,
  onDbNameChange,
  onDbConnStringChange,
  onConnect,
  onCancel,
}: NewConnectionFormProps) {
  return (
    <div className="mx-2 my-2 rounded-md border border-border bg-surface-2 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface-3 border-b border-border">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
          New Connection
        </span>
        <IconBtn onClick={onCancel} title="Cancel" icon={<X size={12} />} />
      </div>

      <div className="px-3 py-3 space-y-3">
        {/* Database type picker */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">
            Database Type
          </div>
          <div className="grid grid-cols-3 gap-1">
            {(["sqlite", "mysql", "postgres"] as DatabaseType[]).map((t) => {
              const meta = DB_META[t];
              const isActive = dbType === t;
              return (
                <button
                  key={t}
                  onClick={() => onDbTypeChange(t)}
                  className={cn(
                    "py-1.5 rounded text-[11px] font-semibold border transition-all",
                    isActive
                      ? "bg-accent-blue/15 border-accent-blue/40 text-accent-blue"
                      : "bg-surface-3 border-transparent text-text-muted hover:border-border/60 hover:text-text-secondary",
                  )}
                >
                  <span className={isActive ? "" : meta.color}>{meta.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Name field */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">
            Name{" "}
            <span className="normal-case opacity-50">(optional)</span>
          </div>
          <input
            className="input w-full text-xs"
            placeholder={
              dbType === "sqlite" ? "e.g. local-db"
              : dbType === "mysql" ? "e.g. dev-mysql"
              : "e.g. prod-pg"
            }
            value={dbName}
            onChange={(e) => onDbNameChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onConnect()}
            autoFocus
          />
        </div>

        {/* Connection URL (non-SQLite only) */}
        {dbType !== "sqlite" && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">
              Connection URL
            </div>
            <input
              className="input w-full text-xs font-mono"
              placeholder={
                dbType === "mysql"
                  ? "mysql://user:pass@localhost:3306/db"
                  : "postgres://user:pass@localhost:5432/db"
              }
              value={dbConnString}
              onChange={(e) => onDbConnStringChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onConnect()}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        )}

        {/* SQLite hint */}
        {dbType === "sqlite" && (
          <p className="text-[10px] text-text-muted leading-relaxed">
            A file browser will open. Select a{" "}
            <code className="font-mono opacity-80">.db</code>,{" "}
            <code className="font-mono opacity-80">.sqlite</code>, or{" "}
            <code className="font-mono opacity-80">.sqlite3</code> file.
          </p>
        )}

        {/* Connect button */}
        <button
          onClick={onConnect}
          disabled={isLoading}
          className="btn-primary text-xs w-full justify-center gap-2"
        >
          {isLoading ? (
            <LoadingSpinner size={12} />
          ) : dbType === "sqlite" ? (
            <FolderOpen size={13} />
          ) : (
            <Database size={13} />
          )}
          {isLoading
            ? "Connecting…"
            : dbType === "sqlite"
              ? "Browse SQLite file…"
              : "Connect"}
        </button>
      </div>
    </div>
  );
}
