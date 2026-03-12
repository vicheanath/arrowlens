import React from "react";
import { SqlDialect } from "../../../utils/sql";

interface QuerySuggestionsBarProps {
  sourceRecommendations: string[];
  activeDialect: SqlDialect;
  appendTemplate: (snippet: string) => void;
  buildSelectAll: (tableName: string, limit?: number, dialect?: SqlDialect) => string;
}

export function QuerySuggestionsBar({
  sourceRecommendations,
  activeDialect,
  appendTemplate,
  buildSelectAll,
}: QuerySuggestionsBarProps) {
  return (
    <div className="flex-shrink-0 border-b border-border/60 bg-surface-1 px-3 py-1.5">
      <div className="flex items-center gap-2 overflow-x-auto">
        <span className="text-[11px] text-text-muted whitespace-nowrap">Suggested sources:</span>
        {sourceRecommendations.length === 0 && (
          <span className="text-[11px] text-text-muted/70">No schema loaded yet</span>
        )}
        {sourceRecommendations.map((sourceName) => (
          <button
            key={sourceName}
            onClick={() => appendTemplate(buildSelectAll(sourceName, 100, activeDialect))}
            className="px-2 py-0.5 rounded border border-border/70 text-[11px] text-text-secondary hover:bg-surface-3 whitespace-nowrap"
            title={`Insert SELECT for ${sourceName}`}
          >
            {sourceName}
          </button>
        ))}
      </div>
    </div>
  );
}
