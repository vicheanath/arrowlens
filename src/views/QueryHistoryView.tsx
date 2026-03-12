import React from "react";
import { Clock, Check, AlertCircle } from "lucide-react";
import { useQueryStore } from "../state/queryStore";
import { formatDate, formatDuration, cn } from "../utils/formatters";

export function QueryHistoryView() {
  const { history, loadFromHistory } = useQueryStore();

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-text-muted gap-2">
        <Clock size={28} className="opacity-30" />
        <p className="text-sm">No query history yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-border">
      {history.map((entry) => (
        <button
          key={entry.id}
          onClick={() => loadFromHistory(entry)}
          className="flex flex-col gap-1 px-3 py-2.5 text-left hover:bg-surface-4 transition-colors group"
        >
          <div className="flex items-center gap-2">
            {entry.error ? (
              <AlertCircle size={12} className="text-accent-red flex-shrink-0" />
            ) : (
              <Check size={12} className="text-accent-green flex-shrink-0" />
            )}
            <span className="text-xs text-text-muted">{formatDate(entry.executed_at)}</span>
            {entry.elapsed_ms !== null && (
              <span className="text-xs text-text-muted font-mono ml-auto">
                {formatDuration(entry.elapsed_ms)}
              </span>
            )}
            {entry.row_count !== null && (
              <span className="text-xs text-text-muted font-mono">
                {entry.row_count.toLocaleString()} rows
              </span>
            )}
          </div>
          <pre className="text-xs text-text-secondary font-mono truncate max-w-full whitespace-pre-wrap line-clamp-2">
            {entry.sql}
          </pre>
        </button>
      ))}
    </div>
  );
}
