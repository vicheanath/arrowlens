import React from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "../../utils/formatters";
import { shortTypeName, TYPE_TAG_CLASS } from "../../utils/dataTypes";
import { getTypeCategory } from "../../models/dataset";
import type { SortOrder } from "../../models/query";

export interface HeaderColumnProps {
  column: string;
  index: number;
  width: number;
  dataType: string;
  sortOrder: SortOrder;
  onSort: (column: string) => void;
  onResizeStart: (event: React.MouseEvent, index: number) => void;
}

export function HeaderColumn({
  column,
  index,
  width,
  dataType,
  sortOrder,
  onSort,
  onResizeStart,
}: HeaderColumnProps) {
  const category = getTypeCategory(dataType);
  const tagClass = TYPE_TAG_CLASS[category];

  return (
    <div
      className="relative flex-shrink-0 border-r border-border/40"
      style={{ width, minWidth: width }}
    >
      <button
        type="button"
        className="w-full h-full flex flex-col justify-center px-3 cursor-pointer select-none group/col hover:bg-surface-4 transition-colors"
        onClick={() => onSort(column)}
        title={`Sort by ${column}`}
      >
        <div className="flex items-center gap-1 text-text-primary text-sm font-medium text-truncate">
          <span className="text-truncate flex-1 text-left">{column}</span>
          <span className="opacity-40 group-hover/col:opacity-100 transition-opacity">
            {sortOrder === "asc" ? (
              <ArrowUp size={12} />
            ) : sortOrder === "desc" ? (
              <ArrowDown size={12} />
            ) : (
              <ChevronsUpDown size={12} className="opacity-0 group-hover/col:opacity-100" />
            )}
          </span>
        </div>
        {dataType && (
          <span className={cn("mt-0.5 self-start", tagClass)}>{shortTypeName(dataType)}</span>
        )}
      </button>

      <div
        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-accent-blue/30"
        onMouseDown={(event) => onResizeStart(event, index)}
        title="Resize column"
      />
    </div>
  );
}
