import React from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "../../utils/formatters";
import { shortTypeName, TYPE_TAG_CLASS, isRightAligned } from "../../utils/dataTypes";
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
  onResizeReset: (index: number) => void;
}

export function HeaderColumn({
  column,
  index,
  width,
  dataType,
  sortOrder,
  onSort,
  onResizeStart,
  onResizeReset,
}: HeaderColumnProps) {
  const category = getTypeCategory(dataType);
  const tagClass = TYPE_TAG_CLASS[category];
  const right = isRightAligned(dataType);

  return (
    <div
      role="columnheader"
      aria-colindex={index + 1}
      className={cn(
        "group/col relative h-full flex-shrink-0 border-r border-border/40",
        sortOrder && "bg-primary/5",
      )}
      style={{ width, minWidth: width }}
      aria-sort={sortOrder === "asc" ? "ascending" : sortOrder === "desc" ? "descending" : "none"}
    >
      <button
        type="button"
        className="flex h-full w-full cursor-pointer select-none flex-col justify-center px-3 transition-colors hover:bg-accent"
        onClick={() => onSort(column)}
        title={`${column}${dataType ? ` · ${dataType}` : ""}\nClick to sort`}
      >
        <div
          className={cn(
            "flex items-center gap-1 text-sm font-medium text-foreground",
            right && "flex-row-reverse",
          )}
        >
          <span className="text-truncate flex-1 text-left">{column}</span>
          <span
            className={cn(
              "flex-shrink-0 transition-opacity",
              sortOrder ? "text-primary opacity-100" : "opacity-40 group-hover/col:opacity-100",
            )}
          >
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
          <span className={cn("mt-0.5", tagClass, right ? "self-end" : "self-start")}>
            {shortTypeName(dataType)}
          </span>
        )}
      </button>

      <div
        className="absolute -right-1 top-0 z-10 flex h-full w-2.5 cursor-col-resize items-center justify-center"
        onMouseDown={(event) => onResizeStart(event, index)}
        onDoubleClick={(event) => {
          event.stopPropagation();
          onResizeReset(index);
        }}
        title="Drag to resize · Double-click to reset"
      >
        <span className="h-full w-px bg-border transition-colors group-hover/col:bg-primary/40" />
      </div>
    </div>
  );
}
