import React, { useState } from "react";
import { Bookmark, Trash2, Play, Tag, Search } from "lucide-react";
import { useQuerySqlStore, useSavedQueriesStore } from "../state/queryStore";
import { formatDate } from "../utils/formatters";
import { useConfirm } from "./ConfirmDialog";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";

export function SavedQueriesPanel() {
  const { savedQueries, removeSavedQuery } = useSavedQueriesStore();
  const { setSql } = useQuerySqlStore();
  const [search, setSearch] = useState("");
  const confirm = useConfirm();

  const requestRemove = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Delete "${name}"?`,
      description: "This permanently removes the saved query.",
      confirmLabel: "Delete",
    });
    if (ok) removeSavedQuery(id);
  };

  const filtered = savedQueries.filter(
    (q) =>
      q.name.toLowerCase().includes(search.toLowerCase()) ||
      q.sql.toLowerCase().includes(search.toLowerCase()) ||
      q.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))
  );

  if (savedQueries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
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
        <div className="relative">
          <Search
            size={12}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="text"
            aria-label="Search saved queries"
            placeholder="Search saved queries…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 pl-7 text-xs"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto divide-y divide-border">
        {filtered.length === 0 && (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">No matches</div>
        )}
        {filtered.map((query) => (
          <div
            key={query.id}
            className="group flex flex-col gap-1 px-3 py-2.5 hover:bg-accent transition-colors"
          >
            <div className="flex items-center gap-2">
              <Bookmark size={11} className="text-primary flex-shrink-0" />
              <span className="text-xs font-medium text-foreground truncate flex-1">
                {query.name}
              </span>
              <span className="text-[10px] text-muted-foreground">{formatDate(query.created_at)}</span>
            </div>

            <pre className="text-xs text-muted-foreground font-mono truncate max-w-full whitespace-pre-wrap line-clamp-2">
              {query.sql}
            </pre>

            {query.tags.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap mt-0.5">
                <Tag size={10} className="text-muted-foreground" />
                {query.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="h-4 px-1.5 text-[10px]">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}

            <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setSql(query.sql)}
                className="text-accent-teal hover:text-accent-teal"
              >
                <Play size={10} />
                Load
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => void requestRemove(query.id, query.name)}
                className="ml-auto text-destructive hover:text-destructive"
              >
                <Trash2 size={10} />
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
