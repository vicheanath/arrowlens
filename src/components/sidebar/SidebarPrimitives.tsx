import React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "../../utils/formatters";
import { DatabaseType } from "../../models/database";
import { DATABASE_PROVIDERS } from "../../models/databaseProviders";
import { Button } from "@/components/ui/button";

// ─── Per-DB-type visual metadata (derived from the provider registry) ────────
export const DB_META: Record<DatabaseType, { label: string; color: string }> =
  Object.fromEntries(
    Object.entries(DATABASE_PROVIDERS).map(([type, p]) => [
      type,
      { label: p.label, color: p.color },
    ]),
  ) as Record<DatabaseType, { label: string; color: string }>;

// ─── IconBtn ──────────────────────────────────────────────────────────────────

export interface IconBtnProps {
  onClick: (e: React.MouseEvent) => void;
  title: string;
  icon: React.ReactNode;
  variant?: "default" | "blue" | "red";
  className?: string;
  disabled?: boolean;
}

export function IconBtn({ onClick, title, icon, variant = "default", className, disabled = false }: IconBtnProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      className={cn(
        "text-muted-foreground",
        variant === "blue" && "hover:text-primary",
        variant === "red" && "hover:text-destructive",
        className,
      )}
    >
      {icon}
    </Button>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

export interface EmptyStateProps {
  message: string;
  action?: { label: string; icon: React.ReactNode; onClick: () => void };
}

export function EmptyState({ message, action }: EmptyStateProps) {
  return (
    <div className="space-y-2 px-4 py-4">
      <p className="text-[11px] leading-relaxed text-muted-foreground">{message}</p>
      {action && (
        <Button variant="ghost" size="sm" onClick={action.onClick} className="text-xs">
          {action.icon}
          {action.label}
        </Button>
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
      className="group flex h-7 flex-shrink-0 cursor-pointer select-none items-center px-2 transition-colors hover:bg-muted"
      onClick={onToggle}
    >
      <span className="mr-1 text-muted-foreground">
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </span>
      <span className="flex-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {count !== undefined && (
        <span className="mr-1 font-mono text-[10px] text-muted-foreground opacity-50">{count}</span>
      )}
      {secondaryAction && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); secondaryAction.onClick(); }}
          className="mr-0.5 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-1 focus-visible:outline-ring group-hover:opacity-100"
          title={secondaryAction.title}
          aria-label={secondaryAction.title}
        >
          {secondaryAction.icon}
        </button>
      )}
      {primaryAction && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); primaryAction.onClick(); }}
          className={cn(
            "rounded p-0.5 transition-opacity focus-visible:outline-1 focus-visible:outline-ring",
            primaryAction.active
              ? "bg-primary/10 text-primary opacity-100"
              : "text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100",
          )}
          title={primaryAction.title}
          aria-label={primaryAction.title}
        >
          {primaryAction.icon}
        </button>
      )}
    </div>
  );
}
