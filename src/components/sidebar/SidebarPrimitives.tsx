import React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "../../utils/formatters";
import { DatabaseType } from "../../models/database";

// ─── Per-DB-type visual metadata ─────────────────────────────────────────────
export const DB_META: Record<DatabaseType, { label: string; color: string }> = {
  sqlite:   { label: "SQLite",   color: "text-blue-400" },
  mysql:    { label: "MySQL",    color: "text-amber-400" },
  postgres: { label: "Postgres", color: "text-emerald-400" },
};

// ─── IconBtn ──────────────────────────────────────────────────────────────────

export interface IconBtnProps {
  onClick: (e: React.MouseEvent) => void;
  title: string;
  icon: React.ReactNode;
  variant?: "default" | "blue" | "red";
  className?: string;
}

export function IconBtn({ onClick, title, icon, variant = "default", className }: IconBtnProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "p-0.5 rounded transition-colors",
        variant === "blue"    && "text-text-muted hover:text-accent-blue hover:bg-accent-blue/10",
        variant === "red"     && "text-text-muted hover:text-accent-red  hover:bg-accent-red/10",
        variant === "default" && "text-text-muted hover:text-text-primary hover:bg-surface-4",
        className,
      )}
    >
      {icon}
    </button>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

export interface EmptyStateProps {
  message: string;
  action?: { label: string; icon: React.ReactNode; onClick: () => void };
}

export function EmptyState({ message, action }: EmptyStateProps) {
  return (
    <div className="px-4 py-4 space-y-2">
      <p className="text-[11px] text-text-muted leading-relaxed">{message}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="btn-ghost text-xs flex items-center gap-1.5 py-1 px-2"
        >
          {action.icon}
          {action.label}
        </button>
      )}
    </div>
  );
}

// ─── SectionHeader (VSCode Explorer style) ───────────────────────────────────

export interface SectionHeaderProps {
  label: string;
  open: boolean;
  onToggle: () => void;
  count?: number;
  primaryAction?: {
    icon: React.ReactNode;
    title: string;
    onClick: () => void;
    active?: boolean;
  };
  secondaryAction?: {
    icon: React.ReactNode;
    title: string;
    onClick: () => void;
  };
}

export function SectionHeader({
  label,
  open,
  onToggle,
  count,
  primaryAction,
  secondaryAction,
}: SectionHeaderProps) {
  return (
    <div
      className="group flex-shrink-0 flex items-center h-7 px-2 cursor-pointer select-none hover:bg-surface-3/60 transition-colors"
      onClick={onToggle}
    >
      <span className="text-text-muted mr-1">
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </span>
      <span className="flex-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        {label}
      </span>
      {count !== undefined && (
        <span className="text-[10px] text-text-muted font-mono opacity-50 mr-1">{count}</span>
      )}
      {secondaryAction && (
        <button
          onClick={(e) => { e.stopPropagation(); secondaryAction.onClick(); }}
          className="p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity text-text-muted hover:text-text-primary hover:bg-surface-4 mr-0.5"
          title={secondaryAction.title}
        >
          {secondaryAction.icon}
        </button>
      )}
      {primaryAction && (
        <button
          onClick={(e) => { e.stopPropagation(); primaryAction.onClick(); }}
          className={cn(
            "p-0.5 rounded transition-opacity",
            primaryAction.active
              ? "text-accent-blue bg-accent-blue/10 opacity-100"
              : "opacity-0 group-hover:opacity-100 text-text-muted hover:text-text-primary hover:bg-surface-4",
          )}
          title={primaryAction.title}
        >
          {primaryAction.icon}
        </button>
      )}
    </div>
  );
}
