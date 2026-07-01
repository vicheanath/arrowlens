import React from "react";
import { ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { StatementResult } from "../../../models/query";
import { VirtualTable } from "../../../components/VirtualTable";
import { formatDuration } from "../../../utils/formatters";

const TABLE_HEIGHT = 360;

/** Renders one collapsible result block per statement in a script run. */
export function MultiResultView({ results }: { results: StatementResult[] }) {
  const [collapsed, setCollapsed] = React.useState<Set<number>>(new Set());

  const toggle = (index: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  return (
    <div className="h-full overflow-auto">
      <div className="flex flex-col gap-3 p-3">
        {results.map((result) => {
          const isCollapsed = collapsed.has(result.index);
          const hasError = Boolean(result.error);
          const hasRows = result.columns.length > 0;

          return (
            <div key={result.index} className="overflow-hidden rounded-lg border border-border bg-card">
              <button
                type="button"
                onClick={() => toggle(result.index)}
                className="flex w-full items-center gap-2 bg-muted/40 px-3 py-2 text-left hover:bg-muted"
              >
                {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                <span className="text-xs font-medium text-foreground">Result {result.index + 1}</span>
                {hasError ? (
                  <span className="flex items-center gap-1 text-xs text-destructive">
                    <AlertTriangle size={12} /> Error
                  </span>
                ) : (
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {result.row_count.toLocaleString()} rows
                    {hasRows ? ` × ${result.columns.length} cols` : ""} · {formatDuration(result.elapsed_ms)}
                    {result.truncated && <span className="ml-1.5 text-amber-400">· truncated</span>}
                  </span>
                )}
                <code className="text-truncate ml-auto max-w-[45%] font-mono text-[11px] text-muted-foreground">
                  {result.sql}
                </code>
              </button>

              {!isCollapsed && (
                <div>
                  {hasError ? (
                    <div className="m-3 flex items-start gap-2 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                      <span className="break-words font-mono">{result.error}</span>
                    </div>
                  ) : hasRows ? (
                    <div style={{ height: TABLE_HEIGHT }}>
                      <VirtualTable
                        columns={result.columns}
                        columnTypes={result.column_types}
                        rows={result.rows}
                        height={TABLE_HEIGHT}
                        editable={false}
                        className="h-full"
                      />
                    </div>
                  ) : (
                    <div className="px-3 py-4 text-xs text-muted-foreground">
                      Statement executed — {result.row_count.toLocaleString()} rows.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
