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
} from "lucide-react";
import { cn } from "../../utils/formatters";
import { DatabaseConnectionInfo } from "../../models/database";
import { LoadingSpinner } from "../LoadingSpinner";
import { IconBtn, EmptyState, DB_META } from "./SidebarPrimitives";

export interface ConnectionsListProps {
  connections: DatabaseConnectionInfo[];
  selectedConnectionId: string | null;
  tablesByConnection: Record<string, string[]>;
  isLoadingTables: boolean;
  expandedIds: Set<string>;
  onSelectConnection: (id: string) => void;
  onToggleExpanded: (id: string) => void;
  onRefreshTables: (id: string) => void;
  onDisconnect: (id: string) => void;
  onTableQuery: (table: string) => void;
  onAddConnection: () => void;
  canQueryConnection?: (id: string) => boolean;
  canInspectTablesConnection?: (id: string) => boolean;
}

export function ConnectionsList({
  connections,
  selectedConnectionId,
  tablesByConnection,
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
  const groupTablesBySchema = (names: string[]) => {
    const grouped: Record<string, Array<{ fullName: string; tableName: string }>> = {};
    for (const fullName of names) {
      const dotIndex = fullName.indexOf(".");
      const schemaName = dotIndex > 0 ? fullName.slice(0, dotIndex) : "default";
      const tableName = dotIndex > 0 ? fullName.slice(dotIndex + 1) : fullName;
      if (!grouped[schemaName]) grouped[schemaName] = [];
      grouped[schemaName].push({ fullName, tableName });
    }
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  };

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
        const groupedTables = groupTablesBySchema(tables);
        const meta = DB_META[c.database_type] ?? { label: c.database_type, color: "text-text-muted" };
        const canQuery = canQueryConnection?.(c.id) ?? true;
        const canInspectTables = canInspectTablesConnection?.(c.id) ?? true;

        return (
          <div key={c.id}>
            {/* Connection row */}
            <div
              className={cn(
                "group flex items-center h-7 pl-1 pr-1 gap-0.5 transition-colors cursor-default",
                "hover:bg-surface-3",
                isSelected && "bg-accent-blue/10 border-l-2 border-l-accent-blue",
              )}
            >
              {/* Expand chevron */}
              <button
                onClick={() => {
                  if (!canInspectTables) return;
                  onToggleExpanded(c.id);
                }}
                disabled={!canInspectTables}
                className="p-1 flex-shrink-0 text-text-muted hover:text-text-secondary rounded"
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
                    ? "text-text-primary font-medium"
                    : "text-text-secondary hover:text-text-primary",
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
                  onClick={() => onDisconnect(c.id)}
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
                  <div className="pl-3 py-2 flex items-center gap-1.5 text-[11px] text-text-muted">
                    <LoadingSpinner size={11} /> Loading tables…
                  </div>
                ) : tables.length === 0 ? (
                  <div className="pl-3 py-2 text-[11px] text-text-muted italic">No tables found</div>
                ) : (
                  groupedTables.map(([schema, schemaTables]) => (
                    <div key={schema}>
                      {schema !== "default" && (
                        <div className="h-6 pl-3 pr-2 flex items-center text-[10px] uppercase tracking-wider text-text-muted/80 bg-surface-2/40 border-y border-border/20">
                          {schema}
                        </div>
                      )}
                      {schemaTables.map(({ fullName, tableName }) => (
                        <div
                          key={fullName}
                          className={cn(
                            "group/tbl flex items-center h-[26px] pl-3 pr-1 gap-1.5 transition-colors",
                            canQuery ? "hover:bg-surface-3 cursor-pointer" : "opacity-60 cursor-not-allowed",
                          )}
                          onClick={() => {
                            if (!canQuery) return;
                            onTableQuery(fullName);
                          }}
                          title={canQuery ? `SELECT * FROM ${fullName}` : "Query is not supported for this source"}
                        >
                          <TableIcon size={12} className="flex-shrink-0 text-text-muted" />
                          <span className="flex-1 text-[11px] text-text-secondary truncate">{tableName}</span>
                          <IconBtn
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!canQuery) return;
                              onTableQuery(fullName);
                            }}
                            title={canQuery ? "Query table" : "Query is not supported for this source"}
                            icon={<Play size={11} />}
                            variant="blue"
                            className="opacity-0 group-hover/tbl:opacity-100"
                            disabled={!canQuery}
                          />
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
