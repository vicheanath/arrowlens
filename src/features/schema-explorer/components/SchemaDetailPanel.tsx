import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Database,
  KeyRound,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Table as TableIcon,
} from "lucide-react";
import { cn } from "../../../utils/formatters";
import { TYPE_TAG_CLASS, getTypeCategory, shortTypeName } from "../../../utils/dataTypes";
import { useSchemaInspector } from "../useSchemaInspector";
import { foreignKeyForColumn, tableIdentity } from "../schemaModel";
import type { InspectedTable } from "../../../models/database";
import { useResultTabState, useSchemaEdit } from "../../../state/uiStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SchemaDetailPanel() {
  const { status, tables, foreignKeys, error, sourceKind, sourceLabel, refetch } =
    useSchemaInspector();
  const { requestSchemaEdit } = useSchemaEdit();
  const { setResultTab } = useResultTabState();
  const editable = sourceKind === "database";
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // Refs to each table card so a foreign-key click can scroll its target into view.
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [scrollTo, setScrollTo] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Jump to a foreign-key target: clear any filter that would hide it, expand it,
  // then scroll + briefly highlight once it's rendered.
  const goToTable = (target: string) => {
    const match = tables.find(
      (t) =>
        t.qualified_name === target ||
        t.name === target ||
        `${t.schema}.${t.name}` === target,
    );
    if (!match) return;
    const id = tableIdentity(match);
    setSearch("");
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setScrollTo(id);
  };

  useEffect(() => {
    if (!scrollTo) return;
    const el = cardRefs.current.get(scrollTo);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    setFlashId(scrollTo);
    setScrollTo(null);
    const timer = window.setTimeout(() => setFlashId(null), 1200);
    return () => window.clearTimeout(timer);
  }, [scrollTo, tables]);

  // Deep-link into the schema editor for a table/column and switch to its tab.
  const addColumn = (table: InspectedTable) => {
    requestSchemaEdit({ tableId: tableIdentity(table), operation: "add_column" });
    setResultTab("schema_editor");
  };
  const renameColumn = (table: InspectedTable, column: string) => {
    requestSchemaEdit({ tableId: tableIdentity(table), column, operation: "rename_column" });
    setResultTab("schema_editor");
  };

  const filtered = useMemo<InspectedTable[]>(() => {
    const term = search.trim().toLowerCase();
    if (!term) return tables;
    return tables
      .map((table) => {
        if (table.name.toLowerCase().includes(term)) return table;
        const columns = table.columns.filter((c) => c.name.toLowerCase().includes(term));
        return columns.length > 0 ? { ...table, columns } : null;
      })
      .filter((t): t is InspectedTable => t !== null);
  }, [tables, search]);

  if (sourceKind === null) {
    return <EmptyState label="Select a connection or dataset to inspect its schema." />;
  }

  if (status === "loading") {
    return <SchemaSkeleton />;
  }

  if (status === "error") {
    return (
      <EmptyState
        label={error ?? "Failed to load schema."}
        action={{ label: "Retry", onClick: refetch }}
        tone="error"
      />
    );
  }

  if (tables.length === 0) {
    return <EmptyState label="No tables found for this source." />;
  }

  const totalColumns = tables.reduce((sum, t) => sum + t.columns.length, 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-border bg-card px-3 py-2">
        <Database size={13} className="text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          <span className="text-foreground/80">{tables.length}</span> tables ·{" "}
          <span className="text-foreground/80">{totalColumns}</span> columns
          {foreignKeys.length > 0 && (
            <>
              {" "}· <span className="text-foreground/80">{foreignKeys.length}</span> relationships
            </>
          )}
          <span className="ml-2 opacity-60">{sourceLabel}</span>
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="relative">
            <Search size={11} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              aria-label="Filter tables and columns"
              placeholder="Filter…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-7 w-36 pl-7 text-xs"
            />
          </div>
          {sourceKind === "database" && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={refetch}
              title="Refresh schema"
              aria-label="Refresh schema"
              className="text-muted-foreground"
            >
              <RefreshCw size={12} />
            </Button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
        {filtered.length === 0 ? (
          <div className="px-2 py-6 text-center text-xs text-muted-foreground">
            No tables or columns match “{search}”.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((table) => {
              const id = tableIdentity(table);
              const isCollapsed = collapsed.has(id);
              return (
                <div
                  key={id}
                  ref={(el) => {
                    if (el) cardRefs.current.set(id, el);
                    else cardRefs.current.delete(id);
                  }}
                  className={cn(
                    "overflow-hidden rounded border border-border bg-card transition-shadow",
                    flashId === id && "ring-2 ring-primary",
                  )}
                >
                  <div className="group/header flex w-full items-center hover:bg-accent/50">
                    <button
                      onClick={() => toggle(id)}
                      className="flex flex-1 items-center gap-2 px-2 py-1.5 text-left"
                    >
                      <span className="text-muted-foreground">
                        {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                      </span>
                      <TableIcon size={13} className="flex-shrink-0 text-accent-blue" />
                      <span className="font-mono text-xs font-medium text-foreground/90">
                        {table.schema && table.schema !== "public" && (
                          <span className="text-muted-foreground">{table.schema}.</span>
                        )}
                        {table.name}
                      </span>
                      <span className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span>{table.columns.length} cols</span>
                        {table.row_estimate != null && (
                          <span className="font-mono">~{table.row_estimate.toLocaleString()} rows</span>
                        )}
                      </span>
                    </button>
                    {editable && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => addColumn(table)}
                        title="Add column"
                        aria-label={`Add column to ${table.name}`}
                        className="mr-1 text-muted-foreground opacity-0 focus-visible:opacity-100 group-hover/header:opacity-100"
                      >
                        <Plus size={12} />
                      </Button>
                    )}
                  </div>

                  {!isCollapsed && (
                    <div className="border-t border-border/60">
                      {table.columns.map((column) => {
                        const cat = getTypeCategory(column.data_type);
                        const fk = foreignKeyForColumn(table, column.name, foreignKeys);
                        return (
                          <div
                            key={column.name}
                            className="group/col flex items-center gap-2 px-3 py-1 text-xs odd:bg-muted/30"
                          >
                            {column.is_primary_key ? (
                              <KeyRound size={11} className="flex-shrink-0 text-accent-yellow" />
                            ) : fk ? (
                              <Link2 size={11} className="flex-shrink-0 text-accent-mauve" />
                            ) : (
                              <span className="w-[11px] flex-shrink-0" />
                            )}
                            <span className="flex-1 truncate font-mono text-foreground/85">
                              {column.name}
                            </span>
                            {fk && (
                              <button
                                type="button"
                                onClick={() => goToTable(fk.to_table)}
                                title={`Go to ${fk.to_table}.${fk.to_column}`}
                                aria-label={`Go to referenced table ${fk.to_table}`}
                                className="truncate rounded font-mono text-[10px] text-accent-mauve underline-offset-2 hover:underline focus-visible:outline-1 focus-visible:outline-ring"
                              >
                                → {fk.to_table}.{fk.to_column}
                              </button>
                            )}
                            {!column.nullable && (
                              <span className="rounded bg-muted px-1 text-[9px] uppercase text-muted-foreground">
                                not null
                              </span>
                            )}
                            <span
                              className={cn("flex-shrink-0 font-mono text-[10px]", TYPE_TAG_CLASS[cat])}
                              title={column.data_type}
                            >
                              {shortTypeName(column.data_type)}
                            </span>
                            {editable && (
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={() => renameColumn(table, column.name)}
                                title="Rename column"
                                aria-label={`Rename column ${column.name}`}
                                className="size-4 flex-shrink-0 text-muted-foreground opacity-0 focus-visible:opacity-100 group-hover/col:opacity-100"
                              >
                                <Pencil size={10} />
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

interface EmptyStateProps {
  label: string;
  spin?: boolean;
  tone?: "muted" | "error";
  action?: { label: string; onClick: () => void };
}

function EmptyState({ label, spin, tone = "muted", action }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <Database
        size={26}
        className={cn("opacity-40", tone === "error" ? "text-destructive" : "text-muted-foreground")}
      />
      <p className={cn("text-sm", tone === "error" ? "text-destructive" : "text-muted-foreground")}>
        {label}
      </p>
      {spin && <RefreshCw size={14} className="animate-spin text-muted-foreground" />}
      {action && (
        <Button variant="outline" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

/** Pulsing placeholder shown while the schema is being introspected. */
function SchemaSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-border bg-card px-3 py-2">
        <Database size={13} className="text-muted-foreground opacity-40" />
        <div className="h-3 w-40 animate-pulse rounded bg-muted" />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden px-2 py-2">
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded border border-border bg-card">
              <div className="flex items-center gap-2 px-2 py-1.5">
                <div className="size-3 animate-pulse rounded bg-muted" />
                <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                <div className="ml-auto h-3 w-12 animate-pulse rounded bg-muted" />
              </div>
              <div className="space-y-1 border-t border-border/60 px-3 py-2">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="h-2.5 w-full max-w-[70%] animate-pulse rounded bg-muted/70" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
