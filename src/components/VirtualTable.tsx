import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VariableSizeGrid } from "react-window";
import { cn } from "../utils/formatters";
import { cellToString } from "../utils/formatters";
import { SortConfig, SortOrder } from "../models/query";
import {
  COL_WIDTH,
  ROW_HEIGHT,
  HEADER_HEIGHT,
  FOOTER_HEIGHT,
  STATUS_HEIGHT,
  EditingCell,
  CellPosition,
  PendingEdit,
} from "./table/tableTypes";
import { compareCellValues, clampWidth, clampIndex, isPrintableKey } from "./table/tableUtils";
import { HeaderColumn } from "./table/HeaderColumn";
import { GridCell, type GridItemData } from "./table/GridCell";

interface VirtualTableProps {
  columns: string[];
  columnTypes?: string[];
  rows: unknown[][];
  height: number;
  className?: string;
  editable?: boolean;
  onCellEdit?: (rowIndex: number, columnIndex: number, value: string | null) => void;
  /** Called when the user scrolls near the bottom and more rows can be loaded. */
  onLoadMore?: () => void;
  /** Whether further rows exist to lazy-load. */
  hasMore?: boolean;
  /** Whether a page fetch is currently in flight. */
  isLoadingMore?: boolean;
}

export function VirtualTable({
  columns,
  columnTypes = [],
  rows,
  height,
  className,
  editable = true,
  onCellEdit,
  onLoadMore,
  hasMore = false,
  isLoadingMore = false,
}: VirtualTableProps) {
  const [sortConfig, setSortConfig] = useState<SortConfig>({ column: "", order: null });
  const [colWidths, setColWidths] = useState<number[]>(() => columns.map(() => COL_WIDTH));
  const [viewportWidth, setViewportWidth] = useState<number>(0);
  const [viewportHeight, setViewportHeight] = useState<number>(0);
  const [scrollLeft, setScrollLeft] = useState<number>(0);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [selectedCell, setSelectedCell] = useState<CellPosition | null>(null);
  const [localRows, setLocalRows] = useState<unknown[][]>(rows);
  const [pendingEdits, setPendingEdits] = useState<Map<string, PendingEdit>>(new Map());
  const [copyFlash, setCopyFlash] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const gridFocusRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<VariableSizeGrid>(null);
  const copyTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    setColWidths(columns.map(() => COL_WIDTH));
    setScrollLeft(0);
    gridRef.current?.scrollTo({ scrollLeft: 0, scrollTop: 0 });
  }, [columns]);

  const prevColumnsRef = useRef<string[] | null>(null);
  useEffect(() => {
    setLocalRows(rows);
    // Distinguish a brand-new result (columns change) from rows being *appended*
    // by lazy load-on-scroll (same columns). Only a new result resets the
    // cursor and any staged edits; appended pages preserve them so the viewport
    // and selection don't jump while the user is scrolling.
    const columnsChanged = prevColumnsRef.current !== columns;
    prevColumnsRef.current = columns;
    if (columnsChanged) {
      setEditingCell(null);
      setPendingEdits(new Map());
      setSelectedCell(
        rows.length > 0 && columns.length > 0 ? { rowIndex: 0, columnIndex: 0 } : null,
      );
    }
  }, [rows, columns]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      setViewportWidth(el.clientWidth);
      setViewportHeight(el.clientHeight);
    };
    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

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

  // Map staged edits (keyed by source-row index) onto their current displayed
  // position so dirty cells stay highlighted even when the view is sorted.
  const editedKeys = useMemo(() => {
    const set = new Set<string>();
    if (pendingEdits.size === 0) return set;
    const sortedIndex = new Map<unknown, number>();
    sortedRows.forEach((row, i) => sortedIndex.set(row, i));
    for (const edit of pendingEdits.values()) {
      const idx = sortedIndex.get(localRows[edit.rowIndex]);
      if (idx !== undefined) set.add(`${idx}:${edit.columnIndex}`);
    }
    return set;
  }, [pendingEdits, sortedRows, localRows]);

  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  const gridWidth = Math.max(1, viewportWidth);
  const pendingBarHeight = editable && pendingEdits.size > 0 ? 32 : 0;
  // Prefer the measured container height so the grid fills whatever space a
  // resizable panel (vertical split, AI panel, window) gives it; fall back to
  // the `height` prop on the very first paint before the observer fires.
  const effectiveHeight = viewportHeight || height;
  const gridHeight = Math.max(120, effectiveHeight - HEADER_HEIGHT - FOOTER_HEIGHT - STATUS_HEIGHT - pendingBarHeight);

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

  const selectAbsolute = useCallback((rowIndex: number, columnIndex: number) => {
    if (!sortedRows.length || !columns.length) return;
    const next: CellPosition = {
      rowIndex: clampIndex(rowIndex, 0, sortedRows.length - 1),
      columnIndex: clampIndex(columnIndex, 0, columns.length - 1),
    };
    setSelectedCell(next);
    gridRef.current?.scrollToItem({
      rowIndex: next.rowIndex,
      columnIndex: next.columnIndex,
      align: "smart",
    });
  }, [columns.length, sortedRows.length]);

  const moveSelection = useCallback((rowDelta: number, colDelta: number) => {
    const current = selectedCell ?? { rowIndex: 0, columnIndex: 0 };
    selectAbsolute(current.rowIndex + rowDelta, current.columnIndex + colDelta);
  }, [selectAbsolute, selectedCell]);

  const copySelectedCell = useCallback(async () => {
    if (!selectedCell) return;
    const value = sortedRows[selectedCell.rowIndex]?.[selectedCell.columnIndex];
    try {
      await navigator.clipboard.writeText(cellToString(value));
      setCopyFlash(true);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopyFlash(false), 1200);
    } catch {
      /* clipboard unavailable */
    }
  }, [selectedCell, sortedRows]);

  const resetColumnWidth = useCallback((columnIndex: number) => {
    setColWidths((prev) => {
      const next = [...prev];
      next[columnIndex] = COL_WIDTH;
      return next;
    });
    gridRef.current?.resetAfterColumnIndex(columnIndex);
  }, []);

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

  /**
   * Stage a value (or NULL) into a displayed cell: updates the local row data and
   * records a pending edit keyed by the underlying source-row index (so it
   * survives sorting). Shared by the inline editor and the Delete-to-NULL path.
   */
  const stageEdit = useCallback(
    (sortedRowIndex: number, columnIndex: number, value: string | null) => {
      const originalRow = sortedRows[sortedRowIndex];
      if (!originalRow) return;
      const sourceRowIndex = localRows.findIndex((row) => row === originalRow);
      if (sourceRowIndex === -1) return;

      setLocalRows((prev) => {
        const next = [...prev];
        const nextRow = [...next[sourceRowIndex]];
        nextRow[columnIndex] = value;
        next[sourceRowIndex] = nextRow;
        return next;
      });
      setPendingEdits((prev) => {
        const next = new Map(prev);
        next.set(`${sourceRowIndex}:${columnIndex}`, {
          rowIndex: sourceRowIndex,
          columnIndex,
          value,
        });
        return next;
      });
    },
    [localRows, sortedRows],
  );

  const saveEditCell = useCallback((nextMove?: { rowDelta: number; colDelta: number }) => {
    if (!editingCell) return;
    stageEdit(editingCell.rowIndex, editingCell.columnIndex, editingCell.draftValue);

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
  }, [columns.length, editingCell, sortedRows.length, stageEdit]);

  /** Stage NULL into the selected cell without entering edit mode (Delete key). */
  const clearSelectedToNull = useCallback(() => {
    if (!selectedCell) return;
    stageEdit(selectedCell.rowIndex, selectedCell.columnIndex, null);
  }, [selectedCell, stageEdit]);

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

  const handleGridScroll = useCallback(
    ({ scrollLeft: nextLeft, scrollTop }: { scrollLeft: number; scrollTop: number }) => {
      setScrollLeft(nextLeft);
      if (!onLoadMore || !hasMore || isLoadingMore) return;
      // Prefetch the next page ~12 rows before the end so it's seamless.
      const totalHeight = sortedRows.length * ROW_HEIGHT;
      const threshold = ROW_HEIGHT * 12;
      if (scrollTop + gridHeight >= totalHeight - threshold) {
        onLoadMore();
      }
    },
    [onLoadMore, hasMore, isLoadingMore, sortedRows.length, gridHeight],
  );

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

  const handleSelect = useCallback((rowIndex: number, columnIndex: number) => {
    gridFocusRef.current?.focus();
    setSelectedCell({ rowIndex, columnIndex });
  }, []);

  const handleDraftChange = useCallback(
    (rowIndex: number, columnIndex: number, draftValue: string) => {
      setEditingCell((current) => {
        if (!current) return current;
        if (current.rowIndex !== rowIndex || current.columnIndex !== columnIndex) {
          return current;
        }
        return { ...current, draftValue };
      });
    },
    [],
  );

  const handleGridKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!sortedRows.length || !columns.length) return;
      if (editingCell) return; // the active input owns editing keys

      const cell = selectedCell ?? { rowIndex: 0, columnIndex: 0 };
      const ctrl = event.ctrlKey || event.metaKey;
      const pageRows = Math.max(1, Math.floor(gridHeight / ROW_HEIGHT) - 1);

      if (ctrl && (event.key === "c" || event.key === "C")) {
        event.preventDefault();
        void copySelectedCell();
        return;
      }
      if (event.key === "ArrowUp") { event.preventDefault(); moveSelection(-1, 0); return; }
      if (event.key === "ArrowDown") { event.preventDefault(); moveSelection(1, 0); return; }
      if (event.key === "ArrowLeft") { event.preventDefault(); moveSelection(0, -1); return; }
      if (event.key === "ArrowRight") { event.preventDefault(); moveSelection(0, 1); return; }
      if (event.key === "Home") {
        event.preventDefault();
        if (ctrl) selectAbsolute(0, 0);
        else selectAbsolute(cell.rowIndex, 0);
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        if (ctrl) selectAbsolute(sortedRows.length - 1, columns.length - 1);
        else selectAbsolute(cell.rowIndex, columns.length - 1);
        return;
      }
      if (event.key === "PageUp") { event.preventDefault(); moveSelection(-pageRows, 0); return; }
      if (event.key === "PageDown") { event.preventDefault(); moveSelection(pageRows, 0); return; }
      if (event.key === "Tab") {
        event.preventDefault();
        moveSelection(0, event.shiftKey ? -1 : 1);
        return;
      }
      if (editable && (event.key === "Enter" || event.key === "F2")) {
        event.preventDefault();
        startEditCell(cell.rowIndex, cell.columnIndex);
        return;
      }
      if (editable && (event.key === "Delete" || event.key === "Backspace")) {
        event.preventDefault();
        clearSelectedToNull();
        return;
      }
      if (editable && isPrintableKey(event)) {
        event.preventDefault();
        startEditCell(cell.rowIndex, cell.columnIndex, event.key);
      }
    },
    [
      sortedRows,
      columns.length,
      editingCell,
      selectedCell,
      gridHeight,
      copySelectedCell,
      moveSelection,
      selectAbsolute,
      startEditCell,
      clearSelectedToNull,
      editable,
    ],
  );

  const activeDescendantId = selectedCell
    ? `vt-cell-${selectedCell.rowIndex}-${selectedCell.columnIndex}`
    : undefined;

  const itemData = useMemo<GridItemData>(
    () => ({
      rows: sortedRows,
      columnTypes,
      editable,
      editingCell,
      selectedCell,
      editedKeys,
      draftValue: editingCell?.draftValue ?? "",
      onSelect: handleSelect,
      onStartEdit: startEditCell,
      onDraftChange: handleDraftChange,
      onCancel: cancelEditCell,
      onSave: saveEditCell,
    }),
    [
      sortedRows,
      columnTypes,
      editable,
      editingCell,
      selectedCell,
      editedKeys,
      handleSelect,
      startEditCell,
      handleDraftChange,
      cancelEditCell,
      saveEditCell,
    ],
  );

  if (columns.length === 0) {
    return (
      <div className={cn("flex items-center justify-center text-muted-foreground text-sm h-full", className)}>
        No data to display
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn("flex flex-col overflow-hidden", className)}
    >
      <div className="flex-shrink-0 h-7 bg-card border-b border-border/70 flex items-center justify-between gap-3 px-3 text-[11px] font-mono text-muted-foreground">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex-shrink-0">
            {selectedCell ? `R${selectedCell.rowIndex + 1} · C${selectedCell.columnIndex + 1}` : "-"}
          </span>
          {selectedCell && (
            <span className="flex-shrink-0 text-foreground/80 text-truncate max-w-[160px]">
              {columns[selectedCell.columnIndex] ?? ""}
            </span>
          )}
          {selectedCell && (
            <span className="text-truncate text-muted-foreground/80">
              = {cellToString(sortedRows[selectedCell.rowIndex]?.[selectedCell.columnIndex]) || "∅"}
            </span>
          )}
          {editingCell && <span className="flex-shrink-0 text-primary">Editing</span>}
          {pendingEdits.size > 0 && (
            <span className="flex-shrink-0 text-amber-300">{pendingEdits.size} unsaved</span>
          )}
        </div>
        <div className="hidden flex-shrink-0 items-center gap-3 opacity-80 md:flex">
          {copyFlash ? (
            <span className="text-emerald-400">Copied!</span>
          ) : (
            <>
              <span>Enter edit</span>
              <span>Del NULL</span>
              <span>⌘/Ctrl+C copy</span>
              <span>Esc cancel</span>
            </>
          )}
        </div>
      </div>

      <div
        ref={gridFocusRef}
        role="grid"
        aria-label="Query results"
        aria-rowcount={sortedRows.length + 1}
        aria-colcount={columns.length}
        aria-multiselectable={false}
        aria-activedescendant={activeDescendantId}
        tabIndex={0}
        onKeyDown={handleGridKeyDown}
        className="flex min-h-0 flex-1 flex-col outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/40"
      >
        {/* Column headers */}
        <div
          className="flex-shrink-0 bg-muted border-b border-border overflow-hidden"
          style={{ height: HEADER_HEIGHT }}
        >
          <div
            role="row"
            aria-rowindex={1}
            className="flex h-full will-change-transform"
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
                onResizeReset={resetColumnWidth}
              />
            );
          })}
        </div>
      </div>

      {/* Data grid */}
      {sortedRows.length === 0 ? (
        <div className="flex items-center justify-center text-muted-foreground text-sm" style={{ height: gridHeight }}>
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
          itemData={itemData}
        >
          {GridCell}
        </VariableSizeGrid>
      )}

      {/* Screen-reader announcement for cell copy (visual cue is the flash). */}
      <span className="sr-only" role="status" aria-live="polite">
        {copyFlash ? "Copied cell to clipboard" : ""}
      </span>
      </div>

      {editable && pendingEdits.size > 0 && (
        <div className="flex-shrink-0 h-8 bg-card border-t border-border flex items-center justify-between px-3">
          <span className="text-xs text-muted-foreground font-mono">
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

      <div className="flex-shrink-0 h-6 bg-muted border-t border-border flex items-center justify-between gap-3 px-3 text-xs text-muted-foreground font-mono">
        <span>
          {rows.length.toLocaleString()}
          {hasMore ? "+" : ""} rows × {columns.length} columns
        </span>
        {isLoadingMore ? (
          <span className="animate-pulse text-primary">Loading more…</span>
        ) : hasMore ? (
          <span className="opacity-70">Scroll for more</span>
        ) : null}
      </div>
    </div>
  );
}
