import React from "react";
import { cn } from "../../utils/formatters";
import { TYPE_TAG_CLASS, shortTypeName } from "../../utils/dataTypes";
import { analyzeColumns, ColumnStat } from "./columnStats";

interface QueryAnalyzerProps {
  columns: string[];
  columnTypes?: string[];
  rows: unknown[][];
  className?: string;
}

/**
 * "Analyzer" tab: a quick statistical profile of the current result set —
 * per-column null %, distinct cardinality, numeric ranges and most-frequent
 * values. Computed client-side from the loaded rows.
 */
export function QueryAnalyzer({ columns, columnTypes = [], rows, className }: QueryAnalyzerProps) {
  const stats = React.useMemo(
    () => analyzeColumns(columns, columnTypes, rows),
    [columns, columnTypes, rows],
  );

  if (!columns.length || !rows.length) {
    return (
      <div className={cn("flex items-center justify-center text-sm text-muted-foreground", className)}>
        Run a query to analyze results
      </div>
    );
  }

  return (
    <div className={cn("h-full overflow-auto p-3", className)}>
      <div className="mb-2 text-[11px] text-muted-foreground">
        Profiling {rows.length.toLocaleString()} row{rows.length === 1 ? "" : "s"} ×{" "}
        {columns.length} column{columns.length === 1 ? "" : "s"}
      </div>
      <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
        {stats.map((stat) => (
          <ColumnStatCard key={stat.name} stat={stat} />
        ))}
      </div>
    </div>
  );
}

function ColumnStatCard({ stat }: { stat: ColumnStat }) {
  const tagClass = TYPE_TAG_CLASS[stat.category];
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <span className="flex-1 truncate font-mono text-xs font-medium text-foreground" title={stat.name}>
          {stat.name}
        </span>
        {stat.dataType && <span className={cn("flex-shrink-0", tagClass)}>{shortTypeName(stat.dataType)}</span>}
      </div>

      {/* Null fill bar */}
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary/70"
            style={{ width: `${Math.max(0, 100 - stat.nullPct)}%` }}
          />
        </div>
        <span className="flex-shrink-0 text-[10px] tabular-nums text-muted-foreground">
          {stat.nullPct === 0 ? "no nulls" : `${stat.nullPct.toFixed(stat.nullPct < 1 ? 1 : 0)}% null`}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <Stat label="Non-null" value={fmt(stat.nonNull)} />
        <Stat label="Distinct" value={`${stat.distinctCapped ? "≥" : ""}${fmt(stat.distinct)}`} />
        {stat.isNumeric ? (
          <>
            <Stat label="Min" value={fmtNum(stat.min)} />
            <Stat label="Max" value={fmtNum(stat.max)} />
            <Stat label="Mean" value={fmtNum(stat.mean)} />
          </>
        ) : (
          <Stat
            label="Length"
            value={stat.minLen === null ? "—" : `${stat.minLen}–${stat.maxLen}`}
          />
        )}
      </div>

      {stat.top.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-border/60 pt-2">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Top values</span>
          {stat.top.map((t) => {
            const pct = stat.nonNull > 0 ? (t.count / stat.nonNull) * 100 : 0;
            return (
              <div key={t.value} className="relative overflow-hidden rounded bg-muted/40">
                <div className="absolute inset-y-0 left-0 bg-primary/15" style={{ width: `${pct}%` }} />
                <div className="relative flex items-center justify-between gap-2 px-1.5 py-0.5">
                  <span className="truncate font-mono text-[11px] text-foreground/90" title={t.value}>
                    {t.value === "" ? "(empty)" : t.value}
                  </span>
                  <span className="flex-shrink-0 text-[10px] tabular-nums text-muted-foreground">
                    {fmt(t.count)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-mono tabular-nums text-foreground/90" title={value}>
        {value}
      </span>
    </div>
  );
}

function fmt(n: number): string {
  return n.toLocaleString();
}

function fmtNum(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 3 });
}
