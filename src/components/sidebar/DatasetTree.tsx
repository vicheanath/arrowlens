import React from "react";
import {
  Upload,
  Trash2,
  BarChart2,
  Table as TableIcon,
  ChevronRight,
  ChevronDown,
  Play,
  Columns,
} from "lucide-react";
import { cn } from "../../utils/formatters";
import { DatasetInfo, DatasetSchema } from "../../models/dataset";
import { getTypeCategory } from "../../models/dataset";
import { TYPE_TAG_CLASS, shortTypeName } from "../../utils/dataTypes";
import { LoadingSpinner } from "../LoadingSpinner";
import { IconBtn, EmptyState } from "./SidebarPrimitives";

export interface DatasetTreeProps {
  datasets: DatasetInfo[];
  selectedId: string | null;
  schema: DatasetSchema | null;
  isLoading: boolean;
  error: string | null;
  expandedIds: Set<string>;
  onSelect: (id: string) => void;
  onQuery: (datasetName: string) => void;
  onStats: (id: string) => void;
  onRemove: (id: string) => void;
  onColumnQuery: (table: string, col: string) => void;
  onImport: () => void;
  canQueryDataset?: (id: string) => boolean;
  canStatsDataset?: (id: string) => boolean;
}

export function DatasetTree({
  datasets,
  selectedId,
  schema,
  isLoading,
  error,
  expandedIds,
  onSelect,
  onQuery,
  onStats,
  onRemove,
  onColumnQuery,
  onImport,
  canQueryDataset,
  canStatsDataset,
}: DatasetTreeProps) {
  if (isLoading) {
    return (
      <div className="py-5 flex justify-center">
        <LoadingSpinner size={14} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-2 my-1 px-2 py-1 text-[11px] text-accent-red bg-accent-red/10 rounded border border-accent-red/20">
        {error}
      </div>
    );
  }

  if (datasets.length === 0) {
    return (
      <EmptyState
        message="No datasets. Import a CSV, Parquet, JSON, or Arrow file to start querying."
        action={{ label: "Import File", icon: <Upload size={12} />, onClick: onImport }}
      />
    );
  }

  return (
    <>
      {datasets.map((d) => {
        const isActive = d.id === selectedId;
        const isExpanded = expandedIds.has(d.id);
        const columns = isActive ? schema?.fields ?? null : null;
        const canQuery = canQueryDataset?.(d.id) ?? true;
        const canStats = canStatsDataset?.(d.id) ?? true;

        return (
          <div key={d.id}>
            {/* Dataset row */}
            <div
              className={cn(
                "group flex items-center h-7 pl-1.5 pr-1 gap-1 cursor-pointer transition-colors",
                "hover:bg-surface-3",
                isActive && "bg-accent-blue/10 border-l-2 border-l-accent-blue",
              )}
              onClick={() => onSelect(d.id)}
              title={d.name}
            >
              <span className="p-0.5 text-text-muted flex-shrink-0">
                {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              </span>
              <TableIcon
                size={13}
                className={cn("flex-shrink-0", isActive ? "text-accent-blue" : "text-text-muted")}
              />
              <span
                className={cn(
                  "flex-1 text-xs truncate min-w-0",
                  isActive ? "text-text-primary font-medium" : "text-text-secondary",
                )}
              >
                {d.name}
              </span>
              {d.row_count !== null && (
                <span className="text-[10px] text-text-muted font-mono opacity-0 group-hover:opacity-50 flex-shrink-0">
                  {d.row_count.toLocaleString()}
                </span>
              )}
              <div className="opacity-0 group-hover:opacity-100 flex items-center flex-shrink-0">
                <IconBtn
                  onClick={(e) => { e.stopPropagation(); if (canQuery) onQuery(d.name); }}
                  title={canQuery ? "Query (SELECT *)" : "Query is not supported for this source"}
                  icon={<Play size={11} />}
                  variant="blue"
                  disabled={!canQuery}
                />
                <IconBtn
                  onClick={(e) => { e.stopPropagation(); if (canStats) onStats(d.id); }}
                  title={canStats ? "Statistics" : "Statistics are not supported for this source"}
                  icon={<BarChart2 size={11} />}
                  disabled={!canStats}
                />
                <IconBtn
                  onClick={(e) => { e.stopPropagation(); onRemove(d.id); }}
                  title="Remove dataset" icon={<Trash2 size={11} />} variant="red"
                />
              </div>
            </div>

            {/* Schema columns (when expanded) */}
            {isExpanded && (
              columns ? (
                <div className="border-l border-border/30 ml-[22px]">
                  {columns.map((field) => {
                    const tagCls = TYPE_TAG_CLASS[getTypeCategory(field.data_type)];
                    return (
                      <div
                        key={field.name}
                        className={cn(
                          "flex items-center h-6 pl-3 pr-2 gap-2",
                          canQuery ? "hover:bg-surface-3 cursor-pointer" : "opacity-60 cursor-not-allowed",
                        )}
                        onClick={() => {
                          if (!canQuery) return;
                          onColumnQuery(d.name, field.name);
                        }}
                        title={`${field.data_type}${field.nullable ? " · nullable" : ""}`}
                      >
                        <Columns size={11} className="flex-shrink-0 text-text-muted opacity-40" />
                        <span className="flex-1 text-[11px] text-text-muted truncate font-mono">
                          {field.name}
                        </span>
                        <span className={cn("flex-shrink-0 text-[10px]", tagCls)}>
                          {shortTypeName(field.data_type)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : isActive ? (
                <div className="ml-[22px] pl-3 py-1.5 flex items-center gap-1.5 text-[11px] text-text-muted">
                  <LoadingSpinner size={10} /> Loading schema…
                </div>
              ) : null
            )}
          </div>
        );
      })}
    </>
  );
}
