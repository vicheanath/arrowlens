import React, { useState } from "react";
import { Bookmark, Trash2, Play, Tag, Search } from "lucide-react";
import { useQuerySqlStore, useSavedQueriesStore } from "../state/queryStore";
import { formatDate, cn } from "../utils/formatters";

export function SavedQueriesPanel() {
  const { savedQueries, removeSavedQuery } = useSavedQueriesStore();
  const { setSql } = useQuerySqlStore();
  const [search, setSearch] = useState("");

  const filtered = savedQueries.filter(
    (q) =>
      q.name.toLowerCase().includes(search.toLowerCase()) ||
      q.sql.toLowerCase().includes(search.toLowerCase()) ||
      q.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))
  );

  if (savedQueries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-text-muted gap-2">
        <Bookmark size={28} className="opacity-30" />
        <p className="text-sm">No saved queries</p>
        <p className="text-xs opacity-60">Use the Bookmark button in the query toolbar</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-3 py-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 bg-surface-3 rounded px-2 py-1">
          <Search size={12} className="text-text-muted flex-shrink-0" />
          <input
            type="text"
            placeholder="Search saved queries…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-xs text-text-secondary placeholder:text-text-muted outline-none flex-1 min-w-0"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto divide-y divide-border">
        {filtered.length === 0 && (
          <div className="px-3 py-4 text-xs text-text-muted text-center">No matches</div>
        )}
        {filtered.map((query) => (
          <div
            key={query.id}
            className="group flex flex-col gap-1 px-3 py-2.5 hover:bg-surface-4 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Bookmark size={11} className="text-accent-blue flex-shrink-0" />
              <span className="text-xs font-medium text-text-primary truncate flex-1">
                {query.name}
              </span>
              <span className="text-[10px] text-text-muted">{formatDate(query.created_at)}</span>
            </div>

            <pre className="text-xs text-text-muted font-mono truncate max-w-full whitespace-pre-wrap line-clamp-2">
              {query.sql}
            </pre>

            {query.tags.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap mt-0.5">
                <Tag size={10} className="text-text-muted" />
                {query.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-3 text-text-muted"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => setSql(query.sql)}
                className="flex items-center gap-1 text-[10px] text-accent-teal hover:text-accent-teal/80 px-1.5 py-0.5 rounded hover:bg-surface-3"
              >
                <Play size={10} />
                Load
              </button>
              <button
                onClick={() => removeSavedQuery(query.id)}
                className="flex items-center gap-1 text-[10px] text-accent-red hover:text-accent-red/80 px-1.5 py-0.5 rounded hover:bg-surface-3 ml-auto"
              >
                <Trash2 size={10} />
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
