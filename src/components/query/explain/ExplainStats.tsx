import { PgTimings } from "./types";

interface ExplainStatsProps {
  filteredCount: number;
  totalCount: number;
  maxDepth: number;
  expensiveCount: number;
  pgTimings: PgTimings | null;
  operatorStats: Array<[string, number]>;
}

export function ExplainStats({
  filteredCount,
  totalCount,
  maxDepth,
  expensiveCount,
  pgTimings,
  operatorStats,
}: ExplainStatsProps) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
      <span>{filteredCount.toLocaleString()} / {totalCount.toLocaleString()} operators</span>
      <span>Depth {maxDepth + 1}</span>
      <span>{expensiveCount.toLocaleString()} hot ops</span>
      {pgTimings?.planning && (
        <span className="px-1.5 py-0.5 rounded border border-border/70 bg-surface-3 text-text-secondary">
          Planning: {pgTimings.planning}
        </span>
      )}
      {pgTimings?.execution && (
        <span className="px-1.5 py-0.5 rounded border border-border/70 bg-surface-3 text-accent-emerald">
          Execution: {pgTimings.execution}
        </span>
      )}
      {operatorStats.map(([name, count]) => (
        <span key={name} className="px-1.5 py-0.5 rounded border border-border/70 bg-surface-3 text-text-secondary">
          {name}: {count}
        </span>
      ))}
    </div>
  );
}
