import React from "react";
import { GridChildComponentProps } from "react-window";
import { cn, cellToString } from "../../utils/formatters";
import { isRightAligned } from "../../utils/dataTypes";
import { EditingCell, CellPosition } from "./tableTypes";
import { EditableCellView } from "./EditableCellView";

/** Everything a grid cell needs, passed via react-window's `itemData`. */
export interface GridItemData {
  rows: unknown[][];
  columnTypes: string[];
  editable: boolean;
  editingCell: EditingCell | null;
  selectedCell: CellPosition | null;
  editedKeys: Set<string>;
  draftValue: string;
  onSelect: (rowIndex: number, columnIndex: number) => void;
  onStartEdit: (rowIndex: number, columnIndex: number) => void;
  onDraftChange: (rowIndex: number, columnIndex: number, value: string) => void;
  onCancel: () => void;
  onSave: (nextMove?: { rowDelta: number; colDelta: number }) => void;
}

/**
 * Stable, memoized cell. Defined at module scope (not inside VirtualTable) so
 * react-window doesn't unmount and remount every cell on each parent render.
 */
export const GridCell = React.memo(function GridCell({
  columnIndex,
  rowIndex,
  style,
  data,
}: GridChildComponentProps<GridItemData>) {
  const {
    rows,
    columnTypes,
    editable,
    editingCell,
    selectedCell,
    editedKeys,
    draftValue,
    onSelect,
    onStartEdit,
    onDraftChange,
    onCancel,
    onSave,
  } = data;

  const value = rows[rowIndex]?.[columnIndex];
  const dataType = columnTypes[columnIndex] ?? "";
  const right = isRightAligned(dataType);
  const isEditing =
    editingCell?.rowIndex === rowIndex && editingCell?.columnIndex === columnIndex;
  const isSelected =
    selectedCell?.rowIndex === rowIndex && selectedCell?.columnIndex === columnIndex;
  const isDirty = editedKeys.has(`${rowIndex}:${columnIndex}`);

  return (
    <div
      style={style}
      role="gridcell"
      id={`vt-cell-${rowIndex}-${columnIndex}`}
      aria-colindex={columnIndex + 1}
      aria-rowindex={rowIndex + 2 /* header is row 1 */}
      aria-selected={isSelected}
      tabIndex={-1}
      className={cn(
        "group relative flex items-center border-b border-r border-border/40 px-3",
        "font-mono text-sm transition-colors",
        isEditing ? "z-30 overflow-visible" : "overflow-hidden",
        rowIndex % 2 === 0 ? "bg-card" : "bg-muted/20",
        right ? "justify-end" : "justify-start",
        !isSelected && !isEditing && "hover:bg-foreground/[0.04]",
        isDirty && !isEditing && "bg-amber-500/10 shadow-[inset_2px_0_0_0_var(--color-amber-400)]",
        isSelected && !isEditing && "z-10 bg-primary/10 ring-1 ring-inset ring-primary/80",
      )}
      onClick={() => onSelect(rowIndex, columnIndex)}
      onDoubleClick={() => {
        if (editable) onStartEdit(rowIndex, columnIndex);
      }}
      title={isDirty ? `${cellToString(value)} (edited — unsaved)` : cellToString(value)}
    >
      <EditableCellView
        isEditing={Boolean(isEditing)}
        value={value}
        dataType={dataType}
        rightAligned={right}
        isDirty={isDirty}
        draftValue={isEditing ? draftValue : ""}
        onDraftChange={(next) => onDraftChange(rowIndex, columnIndex, next)}
        onCancel={onCancel}
        onSave={onSave}
      />
    </div>
  );
});
