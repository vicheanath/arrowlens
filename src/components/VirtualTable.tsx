import React, { useCallback, useMemo, useRef, useState } from "react";
import { FixedSizeGrid, FixedSizeList, GridChildComponentProps } from "react-window";
import { cn } from "../utils/formatters";
import { cellToString } from "../utils/formatters";
import { isRightAligned, shortTypeName, TYPE_TAG_CLASS } from "../utils/dataTypes";
import { getTypeCategory } from "../models/dataset";
import { SortConfig, SortOrder } from "../models/query";
import { ArrowUp, ArrowDown, ChevronsUpDown, Copy } from "lucide-react";

const COL_WIDTH = 160;
const ROW_HEIGHT = 32;
const HEADER_HEIGHT = 56;
const MAX_COL_WIDTH = 320;
const MIN_COL_WIDTH = 60;

interface VirtualTableProps {
  columns: string[];
  columnTypes?: string[];
  rows: unknown[][];
  height: number;
  className?: string;
}

export function VirtualTable({
  columns,
  columnTypes = [],
  rows,
  height,
  className,
}: VirtualTableProps) {
  const [sortConfig, setSortConfig] = useState<SortConfig>({ column: "", order: null });
  const [colWidths, setColWidths] = useState<number[]>(() =>
    columns.map(() => COL_WIDTH)
  );
  const gridRef = useRef<FixedSizeGrid>(null);

  const sortedRows = useMemo(() => {
    if (!sortConfig.order || !sortConfig.column) return rows;
    const colIdx = columns.indexOf(sortConfig.column);
    if (colIdx === -1) return rows;
    return [...rows].sort((a, b) => {
      const av = a[colIdx];
      const bv = b[colIdx];
      if (av === null) return 1;
      if (bv === null) return -1;
      const cmp = av! < bv! ? -1 : av! > bv! ? 1 : 0;
      return sortConfig.order === "asc" ? cmp : -cmp;
    });
  }, [rows, sortConfig, columns]);

  const totalWidth = colWidths.reduce((a, b) => a + b, 0);

  const handleSort = (col: string) => {
    setSortConfig((s) => ({
      column: col,
      order: s.column === col
        ? s.order === "asc" ? "desc" : s.order === "desc" ? null : "asc"
        : "asc",
    }));
  };

  const copyCell = (value: unknown) => {
    navigator.clipboard.writeText(cellToString(value)).catch(() => {});
  };

  const Cell = ({ columnIndex, rowIndex, style }: GridChildComponentProps) => {
    const value = sortedRows[rowIndex]?.[columnIndex];
    const dt = columnTypes[columnIndex] ?? "";
    const right = isRightAligned(dt);
    const isNull = value === null || value === undefined;

    return (
      <div
        style={style}
        className={cn(
          "flex items-center px-3 border-b border-r border-border/40 group",
          "overflow-hidden text-sm font-mono",
          rowIndex % 2 === 0 ? "bg-surface-2" : "bg-surface-1",
          right ? "justify-end" : "justify-start"
        )}
        onDoubleClick={() => copyCell(value)}
        title={cellToString(value)}
      >
        {isNull ? (
          <span className="text-text-muted italic text-xs">null</span>
        ) : (
          <span className="text-truncate">{cellToString(value)}</span>
        )}
      </div>
    );
  };

  if (columns.length === 0 || rows.length === 0) {
    return (
      <div className={cn("flex items-center justify-center text-text-muted text-sm h-full", className)}>
        No data to display
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col overflow-hidden", className)}>
      {/* Column headers */}
      <div
        className="flex flex-shrink-0 bg-surface-3 border-b border-border"
        style={{ height: HEADER_HEIGHT }}
      >
        {columns.map((col, i) => {
          const dt = columnTypes[i] ?? "";
          const cat = getTypeCategory(dt);
          const tagCls = TYPE_TAG_CLASS[cat];
          const sortOrder: SortOrder =
            sortConfig.column === col ? sortConfig.order : null;

          return (
            <div
              key={col}
              className="flex flex-col justify-center px-3 border-r border-border/40 cursor-pointer select-none shrink-0 group/col hover:bg-surface-4 transition-colors"
              style={{ width: colWidths[i], minWidth: colWidths[i] }}
              onClick={() => handleSort(col)}
            >
              <div className="flex items-center gap-1 text-text-primary text-sm font-medium text-truncate">
                <span className="text-truncate flex-1">{col}</span>
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
              {dt && (
                <span className={cn("mt-0.5", tagCls)}>{shortTypeName(dt)}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Data grid */}
      <FixedSizeGrid
        ref={gridRef}
        columnCount={columns.length}
        columnWidth={COL_WIDTH}
        rowCount={sortedRows.length}
        rowHeight={ROW_HEIGHT}
        width={totalWidth}
        height={height - HEADER_HEIGHT}
        overscanRowCount={20}
        overscanColumnCount={3}
      >
        {Cell}
      </FixedSizeGrid>

      <div className="flex-shrink-0 h-6 bg-surface-3 border-t border-border flex items-center px-3 text-xs text-text-muted font-mono">
        {rows.length.toLocaleString()} rows × {columns.length} columns
      </div>
    </div>
  );
}
