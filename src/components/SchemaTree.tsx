import React, { useState } from "react";
import { ChevronRight, ChevronDown, Database, Table, Columns } from "lucide-react";
import { DatasetInfo, DatasetSchema } from "../models/dataset";
import { cn } from "../utils/formatters";
import { TYPE_TAG_CLASS } from "../utils/dataTypes";
import { getTypeCategory } from "../models/dataset";
import { shortTypeName } from "../utils/dataTypes";

interface SchemaTreeProps {
  datasets: DatasetInfo[];
  schemas: Record<string, DatasetSchema>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onColumnClick?: (datasetName: string, columnName: string) => void;
}

export function SchemaTree({
  datasets,
  schemas,
  selectedId,
  onSelect,
  onColumnClick,
}: SchemaTreeProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (datasets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 text-center text-text-muted">
        <Database size={28} className="mb-2 opacity-50" />
        <p className="text-sm">No datasets loaded</p>
        <p className="text-xs mt-1 opacity-60">Import a CSV, Parquet, or JSON file to start</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 py-1">
      {datasets.map((ds) => {
        const isExpanded = expandedIds.has(ds.id);
        const isSelected = ds.id === selectedId;
        const schema = schemas[ds.id];

        return (
          <div key={ds.id}>
            {/* Dataset row */}
            <button
              className={cn(
                "w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-sm text-left transition-colors",
                isSelected
                  ? "bg-accent-blue/15 text-accent-blue"
                  : "text-text-secondary hover:bg-surface-4 hover:text-text-primary"
              )}
              onClick={() => {
                onSelect(ds.id);
                toggle(ds.id);
              }}
            >
              <span className="flex-shrink-0 text-text-muted">
                {isExpanded ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
              </span>
              <Table size={14} className="flex-shrink-0" />
              <span className="font-medium text-truncate flex-1">{ds.name}</span>
              {ds.row_count !== null && (
                <span className="text-xs text-text-muted font-mono flex-shrink-0">
                  {ds.row_count.toLocaleString()}
                </span>
              )}
            </button>

            {/* Columns */}
            {isExpanded && schema && (
              <div className="ml-4 border-l border-border/40 pl-2 py-0.5">
                {schema.fields.map((field) => {
                  const cat = getTypeCategory(field.data_type);
                  const tagCls = TYPE_TAG_CLASS[cat];
                  return (
                    <button
                      key={field.name}
                      className="w-full flex items-center gap-2 px-1.5 py-1 rounded text-xs text-left text-text-muted hover:text-text-primary hover:bg-surface-4 transition-colors group"
                      onClick={() => onColumnClick?.(ds.name, field.name)}
                      title={`${field.data_type}${field.nullable ? " | nullable" : ""}`}
                    >
                      <Columns size={11} className="flex-shrink-0 opacity-50" />
                      <span className="flex-1 text-truncate font-mono">{field.name}</span>
                      <span className={cn("flex-shrink-0", tagCls)}>
                        {shortTypeName(field.data_type)}
                      </span>
                      {field.nullable && (
                        <span className="text-text-muted opacity-0 group-hover:opacity-60 text-xs">?</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {isExpanded && !schema && (
              <div className="ml-6 py-1 text-xs text-text-muted italic">
                Loading schema…
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
