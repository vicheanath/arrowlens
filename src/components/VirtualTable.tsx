import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GridChildComponentProps, VariableSizeGrid } from "react-window";
import { cn } from "../utils/formatters";
import { cellToString } from "../utils/formatters";
import { isRightAligned, shortTypeName, TYPE_TAG_CLASS } from "../utils/dataTypes";
import { getTypeCategory } from "../models/dataset";
import { SortConfig, SortOrder } from "../models/query";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

const COL_WIDTH = 160;
const ROW_HEIGHT = 32;
const HEADER_HEIGHT = 56;
const FOOTER_HEIGHT = 24;
const MAX_COL_WIDTH = 320;
const MIN_COL_WIDTH = 60;

interface VirtualTableProps {
  columns: string[];
  columnTypes?: string[];
  rows: unknown[][];
  height: number;
  className?: string;
  editable?: boolean;
  onCellEdit?: (rowIndex: number, columnIndex: number, value: string) => void;
}

interface EditingCell {
  rowIndex: number;
  columnIndex: number;
  draftValue: string;
}

interface CellPosition {
  rowIndex: number;
  columnIndex: number;
}

interface PendingEdit {
  rowIndex: number;
  columnIndex: number;
  value: string;
}

interface HeaderColumnProps {
  column: string;
  index: number;
  width: number;
  dataType: string;
  sortOrder: SortOrder;
  onSort: (column: string) => void;
  onResizeStart: (event: React.MouseEvent, index: number) => void;
}

function HeaderColumn({
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

interface EditableCellViewProps {
  isEditing: boolean;
  value: unknown;
  rightAligned: boolean;
  draftValue: string;
  onDraftChange: (value: string) => void;
  onCancel: () => void;
  onSave: (nextMove?: { rowDelta: number; colDelta: number }) => void;
}

function EditableCellView({
  isEditing,
  value,
  rightAligned,
  draftValue,
  onDraftChange,
  onCancel,
  onSave,
}: EditableCellViewProps) {
  const isNull = value === null || value === undefined;

  if (isEditing) {
    return (
      <div className="w-full flex items-center gap-1.5">
        <input
          autoFocus
          value={draftValue}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onSave({ rowDelta: 1, colDelta: 0 });
            }
            if (event.key === "Tab") {
              event.preventDefault();
              onSave({ rowDelta: 0, colDelta: event.shiftKey ? -1 : 1 });
            }
            if (event.key === "Escape") {
              event.preventDefault();
              onCancel();
            }
          }}
          className={cn(
            "w-full text-xs bg-surface-4 border border-accent-blue/40 rounded px-2 py-1 outline-none",
            rightAligned ? "text-right" : "text-left"
          )}
        />
      </div>
    );
  }

  return (
    isNull ? (
      <span className="text-text-muted italic text-xs">null</span>
    ) : (
      <span className="text-truncate">{cellToString(value)}</span>
    )
  );
}

function compareCellValues(a: unknown, b: unknown): number {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : 1;
  if (b === null || b === undefined) return -1;

  if (typeof a === "number" && typeof b === "number") {
    return a < b ? -1 : a > b ? 1 : 0;
  }

  if (typeof a === "boolean" && typeof b === "boolean") {
    return a === b ? 0 : a ? 1 : -1;
  }

  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function clampWidth(width: number): number {
  return Math.max(MIN_COL_WIDTH, Math.min(MAX_COL_WIDTH, width));
}

function clampIndex(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isPrintableKey(event: React.KeyboardEvent): boolean {
  return event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
}

export function VirtualTable({
  columns,
  columnTypes = [],
  rows,
  height,
  className,
  editable = true,
  onCellEdit,
}: VirtualTableProps) {
  const [sortConfig, setSortConfig] = useState<SortConfig>({ column: "", order: null });
  const [colWidths, setColWidths] = useState<number[]>(() => columns.map(() => COL_WIDTH));
  const [viewportWidth, setViewportWidth] = useState<number>(0);
  const [scrollLeft, setScrollLeft] = useState<number>(0);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [selectedCell, setSelectedCell] = useState<CellPosition | null>(null);
  const [localRows, setLocalRows] = useState<unknown[][]>(rows);
  const [pendingEdits, setPendingEdits] = useState<Map<string, PendingEdit>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<VariableSizeGrid>(null);

  useEffect(() => {
    setColWidths(columns.map(() => COL_WIDTH));
    setScrollLeft(0);
    gridRef.current?.scrollTo({ scrollLeft: 0, scrollTop: 0 });
  }, [columns]);

  useEffect(() => {
    setLocalRows(rows);
    setEditingCell(null);
    setPendingEdits(new Map());
    if (rows.length > 0 && columns.length > 0) {
      setSelectedCell({ rowIndex: 0, columnIndex: 0 });
    } else {
      setSelectedCell(null);
    }
  }, [rows]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateWidth = () => setViewportWidth(el.clientWidth);
    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const sortedRows = useMemo(() => {
    if (!sortConfig.order || !sortConfig.column) return localRows;
    const colIdx = columns.indexOf(sortConfig.column);
    if (colIdx === -1) return localRows;
    return [...localRows].sort((a, b) => {
      const av = a[colIdx];
      const bv = b[colIdx];
      const cmp = compareCellValues(av, bv);
      return sortConfig.order === "asc" ? cmp : -cmp;
    });
  }, [localRows, sortConfig, columns]);

  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  const gridWidth = Math.max(1, viewportWidth);
  const gridHeight = Math.max(80, height - HEADER_HEIGHT - FOOTER_HEIGHT);

  const columnWidth = useCallback(
    (index: number) => colWidths[index] ?? COL_WIDTH,
    [colWidths]
  );

  const handleSort = (col: string) => {
    setSortConfig((s) => ({
      column: col,
      order:
        s.column === col
          ? s.order === "asc"
            ? "desc"
            : s.order === "desc"
              ? null
              : "asc"
          : "asc",
    }));
  };

  const moveSelection = useCallback((rowDelta: number, colDelta: number) => {
    if (!sortedRows.length || !columns.length) return;

    const current = selectedCell ?? { rowIndex: 0, columnIndex: 0 };
    const next: CellPosition = {
      rowIndex: clampIndex(current.rowIndex + rowDelta, 0, sortedRows.length - 1),
      columnIndex: clampIndex(current.columnIndex + colDelta, 0, columns.length - 1),
    };

    setSelectedCell(next);
    gridRef.current?.scrollToItem({
      rowIndex: next.rowIndex,
      columnIndex: next.columnIndex,
      align: "smart",
    });
  }, [columns.length, selectedCell, sortedRows.length]);

  const startEditCell = useCallback((rowIndex: number, columnIndex: number, initialDraft?: string) => {
    const existingValue = sortedRows[rowIndex]?.[columnIndex];
    setSelectedCell({ rowIndex, columnIndex });
    setEditingCell({
      rowIndex,
      columnIndex,
      draftValue: initialDraft ?? cellToString(existingValue),
    });
  }, [sortedRows]);

  const cancelEditCell = useCallback(() => {
    setEditingCell(null);
  }, []);

  const saveEditCell = useCallback((nextMove?: { rowDelta: number; colDelta: number }) => {
    if (!editingCell) return;

    const originalRow = sortedRows[editingCell.rowIndex];
    if (!originalRow) {
      setEditingCell(null);
      return;
    }

    const sourceRowIndex = localRows.findIndex((row) => row === originalRow);
    if (sourceRowIndex === -1) {
      setEditingCell(null);
      return;
    }

    const nextRows = [...localRows];
    const nextRow = [...nextRows[sourceRowIndex]];
    nextRow[editingCell.columnIndex] = editingCell.draftValue;
    nextRows[sourceRowIndex] = nextRow;
    setLocalRows(nextRows);

    setPendingEdits((prev) => {
      const next = new Map(prev);
      const key = `${sourceRowIndex}:${editingCell.columnIndex}`;
      next.set(key, {
        rowIndex: sourceRowIndex,
        columnIndex: editingCell.columnIndex,
        value: editingCell.draftValue,
      });
      return next;
    });

    const nextSelection = {
      rowIndex: clampIndex(
        editingCell.rowIndex + (nextMove?.rowDelta ?? 0),
        0,
        sortedRows.length - 1
      ),
      columnIndex: clampIndex(
        editingCell.columnIndex + (nextMove?.colDelta ?? 0),
        0,
        columns.length - 1
      ),
    };
    setSelectedCell(nextSelection);
    gridRef.current?.scrollToItem({
      rowIndex: nextSelection.rowIndex,
      columnIndex: nextSelection.columnIndex,
      align: "smart",
    });
    setEditingCell(null);
  }, [columns.length, editingCell, localRows, onCellEdit, sortedRows]);

  const startResize = useCallback((event: React.MouseEvent, columnIndex: number) => {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const initialWidth = colWidths[columnIndex] ?? COL_WIDTH;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const nextWidth = clampWidth(initialWidth + delta);
      setColWidths((prev) => {
        const next = [...prev];
        next[columnIndex] = nextWidth;
        return next;
      });
      gridRef.current?.resetAfterColumnIndex(columnIndex);
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, [colWidths]);

  const handleGridScroll = useCallback(({ scrollLeft: nextLeft }: { scrollLeft: number }) => {
    setScrollLeft(nextLeft);
  }, []);

  const saveAllEdits = useCallback(() => {
    if (pendingEdits.size === 0) return;
    for (const edit of pendingEdits.values()) {
      onCellEdit?.(edit.rowIndex, edit.columnIndex, edit.value);
    }
    setPendingEdits(new Map());
  }, [onCellEdit, pendingEdits]);

  const discardAllEdits = useCallback(() => {
    setLocalRows(rows);
    setPendingEdits(new Map());
    setEditingCell(null);
  }, [rows]);

  const Cell = ({ columnIndex, rowIndex, style }: GridChildComponentProps) => {
    const value = sortedRows[rowIndex]?.[columnIndex];
    const dt = columnTypes[columnIndex] ?? "";
    const right = isRightAligned(dt);
    const isEditing =
      editingCell?.rowIndex === rowIndex && editingCell?.columnIndex === columnIndex;
    const isSelected =
      selectedCell?.rowIndex === rowIndex && selectedCell?.columnIndex === columnIndex;

    return (
      <div
        style={style}
        className={cn(
          "flex items-center px-3 border-b border-r border-border/40 group",
          "overflow-hidden text-sm font-mono",
          rowIndex % 2 === 0 ? "bg-surface-2" : "bg-surface-1",
          right ? "justify-end" : "justify-start",
          isSelected && !isEditing && "ring-1 ring-inset ring-accent-blue/70"
        )}
        onClick={() => {
          containerRef.current?.focus();
          setSelectedCell({ rowIndex, columnIndex });
        }}
        onDoubleClick={() => {
          if (editable) {
            startEditCell(rowIndex, columnIndex);
            return;
          }
        }}
        title={cellToString(value)}
      >
        <EditableCellView
          isEditing={Boolean(isEditing)}
          value={value}
          rightAligned={right}
          draftValue={editingCell?.draftValue ?? ""}
          onDraftChange={(draftValue) => {
            setEditingCell((current) => {
              if (!current) return current;
              if (current.rowIndex !== rowIndex || current.columnIndex !== columnIndex) {
                return current;
              }
              return { ...current, draftValue };
            });
          }}
          onCancel={cancelEditCell}
          onSave={saveEditCell}
        />
      </div>
    );
  };

  if (columns.length === 0) {
    return (
      <div className={cn("flex items-center justify-center text-text-muted text-sm h-full", className)}>
        No data to display
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn("flex flex-col overflow-hidden outline-none", className)}
      tabIndex={0}
      onKeyDown={(event) => {
        if (!sortedRows.length || !columns.length) return;

        if (editingCell) {
          // Let input handle editing keys while in edit mode.
          return;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          moveSelection(-1, 0);
          return;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          moveSelection(1, 0);
          return;
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          moveSelection(0, -1);
          return;
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          moveSelection(0, 1);
          return;
        }

        if (event.key === "Tab") {
          event.preventDefault();
          moveSelection(0, event.shiftKey ? -1 : 1);
          return;
        }

        if (editable && (event.key === "Enter" || event.key === "F2")) {
          event.preventDefault();
          const cell = selectedCell ?? { rowIndex: 0, columnIndex: 0 };
          startEditCell(cell.rowIndex, cell.columnIndex);
          return;
        }

        if (editable && isPrintableKey(event)) {
          event.preventDefault();
          const cell = selectedCell ?? { rowIndex: 0, columnIndex: 0 };
          startEditCell(cell.rowIndex, cell.columnIndex, event.key);
        }
      }}
    >
      {/* Column headers */}
      <div
        className="flex-shrink-0 bg-surface-3 border-b border-border overflow-hidden"
        style={{ height: HEADER_HEIGHT }}
      >
        <div
          className="flex will-change-transform"
          style={{ width: totalWidth, transform: `translateX(-${scrollLeft}px)` }}
        >
          {columns.map((col, i) => {
            const sortOrder: SortOrder =
              sortConfig.column === col ? sortConfig.order : null;

            return (
              <HeaderColumn
                key={col}
                column={col}
                index={i}
                width={colWidths[i] ?? COL_WIDTH}
                dataType={columnTypes[i] ?? ""}
                sortOrder={sortOrder}
                onSort={handleSort}
                onResizeStart={startResize}
              />
            );
          })}
        </div>
      </div>

      {/* Data grid */}
      {sortedRows.length === 0 ? (
        <div className="flex items-center justify-center text-text-muted text-sm" style={{ height: gridHeight }}>
          Query returned 0 rows
        </div>
      ) : (
        <VariableSizeGrid
          ref={gridRef}
          columnCount={columns.length}
          columnWidth={columnWidth}
          rowCount={sortedRows.length}
          rowHeight={() => ROW_HEIGHT}
          width={gridWidth}
          height={gridHeight}
          overscanRowCount={20}
          overscanColumnCount={3}
          onScroll={handleGridScroll}
        >
          {Cell}
        </VariableSizeGrid>
      )}

      {editable && pendingEdits.size > 0 && (
        <div className="flex-shrink-0 h-8 bg-surface-2 border-t border-border flex items-center justify-between px-3">
          <span className="text-xs text-text-muted font-mono">
            {pendingEdits.size} pending edit{pendingEdits.size > 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={discardAllEdits}
              className="btn-ghost text-xs"
              title="Discard all unsaved cell edits"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={saveAllEdits}
              className="btn-primary text-xs"
              title="Save all edited cells"
            >
              Save Changes
            </button>
          </div>
        </div>
      )}

      <div className="flex-shrink-0 h-6 bg-surface-3 border-t border-border flex items-center px-3 text-xs text-text-muted font-mono">
        {rows.length.toLocaleString()} rows × {columns.length} columns
      </div>
    </div>
  );
}
