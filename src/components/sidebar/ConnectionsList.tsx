import React from "react";
import {
  Database,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Table as TableIcon,
  Play,
  X,
  Plus,
  Key,
  FileCode,
} from "lucide-react";
import { cn } from "../../utils/formatters";
import {
  ConnectionSchema,
  DatabaseConnectionInfo,
  DatabaseSchemaEntry,
  InspectedForeignKey,
  InspectedTable,
} from "../../models/database";
import { LoadingSpinner } from "../LoadingSpinner";
import { useConfirm } from "../ConfirmDialog";
import { IconBtn, EmptyState, DB_META } from "./SidebarPrimitives";
import { TableDdlDialog } from "./TableDdlDialog";

export interface ConnectionsListProps {
  connections: DatabaseConnectionInfo[];
  selectedConnectionId: string | null;
  tablesByConnection: Record<string, string[]>;
  schemaTreeByConnection: Record<string, DatabaseSchemaEntry[]>;
  schemaDetailByConnection: Record<string, ConnectionSchema>;
  isLoadingTables: boolean;
  expandedIds: Set<string>;
  onSelectConnection: (id: string) => void;
  onToggleExpanded: (id: string) => void;
  onRefreshTables: (id: string) => void;
  onDisconnect: (id: string) => void;
  onTableQuery: (connectionId: string, table: string) => void;
  onAddConnection: () => void;
  canQueryConnection?: (id: string) => boolean;
  canInspectTablesConnection?: (id: string) => boolean;
}

export function ConnectionsList({
  connections,
  selectedConnectionId,
  tablesByConnection,
  schemaTreeByConnection,
  schemaDetailByConnection,
  isLoadingTables,
  expandedIds,
  onSelectConnection,
  onToggleExpanded,
  onRefreshTables,
  onDisconnect,
  onTableQuery,
  onAddConnection,
  canQueryConnection,
  canInspectTablesConnection,
}: ConnectionsListProps) {
  const [expandedSchemas, setExpandedSchemas] = React.useState<Set<string>>(new Set());
  const [expandedTables, setExpandedTables] = React.useState<Set<string>>(new Set());
  const [ddlTarget, setDdlTarget] = React.useState<{ table: InspectedTable; fks: InspectedForeignKey[] } | null>(null);
  const confirm = useConfirm();

  const toggleTable = React.useCallback((tableKey: string) => {
    setExpandedTables((current) => {
      const next = new Set(current);
      if (next.has(tableKey)) next.delete(tableKey);
      else next.add(tableKey);
      return next;
    });
  }, []);

  const requestDisconnect = React.useCallback(
    async (id: string, name: string) => {
      const ok = await confirm({
        title: `Disconnect "${name}"?`,
        description: "This closes the connection. You can reconnect it again at any time.",
        confirmLabel: "Disconnect",
      });
      if (ok) onDisconnect(id);
    },
    [confirm, onDisconnect],
  );

  const toggleSchema = React.useCallback((connectionId: string, schemaName: string) => {
    const schemaKey = `${connectionId}:${schemaName}`;
    setExpandedSchemas((current) => {
      const next = new Set(current);
      if (next.has(schemaKey)) next.delete(schemaKey);
      else next.add(schemaKey);
      return next;
    });
  }, []);

  if (connections.length === 0) {
    return (
      <EmptyState
        message="No connections yet. Add a SQLite file, MySQL, or PostgreSQL database."
        action={{
          label: "New Connection",
          icon: <Plus size={12} />,
          onClick: onAddConnection,
        }}
      />
    );
  }

  return (
    <>
      {connections.map((c) => {
        const isSelected = c.id === selectedConnectionId;
        const isExpanded = expandedIds.has(c.id);
        const tables = tablesByConnection[c.id] ?? [];
        const schemaTree = schemaTreeByConnection[c.id] ?? [];
        const meta = DB_META[c.database_type] ?? { label: c.database_type, color: "text-muted-foreground" };
        const canQuery = canQueryConnection?.(c.id) ?? true;
        const canInspectTables = canInspectTablesConnection?.(c.id) ?? true;
        const detail = schemaDetailByConnection[c.id];
        const tableLookup = buildTableLookup(detail);

        return (
          <div key={c.id}>
            {/* Connection row */}
            <div
              className={cn(
                "group flex items-center h-7 pl-1 pr-1 gap-0.5 transition-colors cursor-default",
                "hover:bg-muted",
                isSelected && "bg-primary/10 border-l-2 border-l-primary",
              )}
            >
              {/* Expand chevron */}
              <button
                onClick={() => {
                  if (!canInspectTables) return;
                  onToggleExpanded(c.id);
                }}
                disabled={!canInspectTables}
                className="p-1 flex-shrink-0 text-muted-foreground hover:text-foreground/80 rounded"
                title={canInspectTables ? (isExpanded ? "Collapse" : "Expand tables") : "Table inspection is not supported for this source"}
              >
                {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              </button>

              {/* Colored DB icon */}
              <Database size={13} className={cn("flex-shrink-0", meta.color)} />

              {/* Name button — routes queries to this connection */}
              <button
                onClick={() => onSelectConnection(c.id)}
                className={cn(
                  "flex-1 text-left px-1.5 text-xs truncate min-w-0 py-0",
                  isSelected
                    ? "text-foreground font-medium"
                    : "text-foreground/80 hover:text-foreground",
                )}
                title={`${c.connection_string}\nClick to route queries to this connection`}
              >
                {c.name}
              </button>

              {/* Type badge */}
              <span className={cn("text-[10px] flex-shrink-0 font-mono opacity-40 pr-1", meta.color)}>
                {meta.label}
              </span>

              {/* Hover actions */}
              <div className="opacity-0 group-hover:opacity-100 flex items-center flex-shrink-0">
                <IconBtn
                  onClick={() => onRefreshTables(c.id)}
                  title="Refresh tables"
                  icon={<RefreshCw size={11} />}
                />
                <IconBtn
                  onClick={() => void requestDisconnect(c.id, c.name)}
                  title="Disconnect"
                  icon={<X size={11} />}
                  variant="red"
                />
              </div>
            </div>

            {/* Tables (when expanded) */}
            {isExpanded && (
              <div className="border-l border-border/30 ml-[22px]">
                {isLoadingTables ? (
                  <div className="pl-3 py-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <LoadingSpinner size={11} /> Loading tables…
                  </div>
                ) : tables.length === 0 ? (
                  <div className="pl-3 py-2 text-[11px] text-muted-foreground italic">No tables found</div>
                ) : (
                  schemaTree.map((schema) => {
                    const schemaKey = `${c.id}:${schema.name}`;
                    const isSchemaExpanded = expandedSchemas.has(schemaKey) || schemaTree.length === 1;

                    return (
                      <div key={schema.name}>
                        <button
                          type="button"
                          onClick={() => toggleSchema(c.id, schema.name)}
                          className="w-full h-6 pl-2.5 pr-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/40 border-y border-border/40 hover:bg-muted"
                          title={`${schema.tables.length} tables`}
                        >
                          {isSchemaExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                          <span className="truncate">{schema.name}</span>
                          <span className="ml-auto text-[10px] opacity-60">{schema.tables.length}</span>
                        </button>

                        {isSchemaExpanded && schema.tables.map((table) => {
                          const inspected =
                            tableLookup.get(`${schema.name.toLowerCase()}:${table.name.toLowerCase()}`) ??
                            tableLookup.get(table.name.toLowerCase());
                          const tableKey = `${c.id}:${table.full_name}`;
                          const isTableExpanded = expandedTables.has(tableKey);

                          return (
                            <div key={table.full_name}>
                              <div
                                className={cn(
                                  "group/tbl flex items-center h-[26px] pl-3 pr-1 gap-1 transition-colors",
                                  canQuery ? "hover:bg-muted" : "opacity-60",
                                )}
                              >
                                {/* Expand columns */}
                                <button
                                  type="button"
                                  onClick={() => inspected && toggleTable(tableKey)}
                                  disabled={!inspected}
                                  className="flex-shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-25"
                                  title={inspected ? (isTableExpanded ? "Hide columns" : "Show columns") : "Columns unavailable"}
                                >
                                  {isTableExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                                </button>

                                {/* Table name — runs SELECT */}
                                <button
                                  type="button"
                                  onClick={() => { if (canQuery) onTableQuery(c.id, table.full_name); }}
                                  disabled={!canQuery}
                                  className={cn(
                                    "flex min-w-0 flex-1 items-center gap-1.5 text-left",
                                    canQuery ? "cursor-pointer" : "cursor-not-allowed",
                                  )}
                                  title={canQuery ? `SELECT * FROM ${table.full_name}` : "Query is not supported for this source"}
                                >
                                  <TableIcon size={12} className="flex-shrink-0 text-muted-foreground" />
                                  <span className="flex-1 truncate text-[11px] text-foreground/80">{table.name}</span>
                                  {inspected?.row_estimate != null && inspected.row_estimate >= 0 && (
                                    <span className="flex-shrink-0 font-mono text-[10px] text-muted-foreground/50">
                                      {formatRowEstimate(inspected.row_estimate)}
                                    </span>
                                  )}
                                </button>

                                {inspected && (
                                  <IconBtn
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDdlTarget({ table: inspected, fks: detail?.foreign_keys ?? [] });
                                    }}
                                    title="View DDL (CREATE TABLE)"
                                    icon={<FileCode size={11} />}
                                    className="opacity-0 group-hover/tbl:opacity-100"
                                  />
                                )}
                                <IconBtn
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (canQuery) onTableQuery(c.id, table.full_name);
                                  }}
                                  title={canQuery ? "Query table" : "Query is not supported for this source"}
                                  icon={<Play size={11} />}
                                  variant="blue"
                                  className="opacity-0 group-hover/tbl:opacity-100"
                                  disabled={!canQuery}
                                />
                              </div>

                              {/* Columns (when expanded) */}
                              {isTableExpanded && inspected && (
                                <div className="ml-[18px] border-l border-border/30 pl-1">
                                  {inspected.columns.length === 0 ? (
                                    <div className="py-1 pl-3 text-[10px] italic text-muted-foreground">No columns</div>
                                  ) : (
                                    inspected.columns.map((col) => (
                                      <div key={col.name} className="flex h-5 items-center gap-1.5 pl-3 pr-2 text-[11px]">
                                        {col.is_primary_key ? (
                                          <Key size={9} className="flex-shrink-0 text-accent-yellow" />
                                        ) : (
                                          <span className="w-[9px] flex-shrink-0" />
                                        )}
                                        <span className="truncate text-foreground/75">{col.name}</span>
                                        <span className="ml-auto flex-shrink-0 truncate font-mono text-[10px] text-muted-foreground/70">
                                          {col.data_type}
                                          {col.nullable ? "" : " ·NN"}
                                        </span>
                                      </div>
                                    ))
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        );
      })}

      {ddlTarget && (
        <TableDdlDialog
          table={ddlTarget.table}
          foreignKeys={ddlTarget.fks}
          onClose={() => setDdlTarget(null)}
        />
      )}
    </>
  );
}

/** Build a name→table lookup keyed by both `schema:name` and bare `name`. */
function buildTableLookup(detail: ConnectionSchema | undefined): Map<string, InspectedTable> {
  const map = new Map<string, InspectedTable>();
  if (!detail) return map;
  for (const table of detail.tables) {
    map.set(`${table.schema.toLowerCase()}:${table.name.toLowerCase()}`, table);
    const bare = table.name.toLowerCase();
    if (!map.has(bare)) map.set(bare, table);
  }
  return map;
}

/** Compact row-count badge, e.g. 1234 → "1.2k". */
function formatRowEstimate(rows: number): string {
  if (rows < 1000) return `${rows}`;
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(rows);
}
