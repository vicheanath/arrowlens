// Shared constants and internal-state interfaces for VirtualTable and its sub-components.

export const COL_WIDTH = 160;
export const ROW_HEIGHT = 32;
export const HEADER_HEIGHT = 56;
export const FOOTER_HEIGHT = 24;
export const STATUS_HEIGHT = 28;
export const MAX_COL_WIDTH = 320;
export const MIN_COL_WIDTH = 60;

/** Current cell being edited + its pending draft text. */
export interface EditingCell {
  rowIndex: number;
  columnIndex: number;
  draftValue: string;
}

/** A selected (highlighted) cell position. */
export interface CellPosition {
  rowIndex: number;
  columnIndex: number;
}

/** A staged edit waiting to be commited via "Save Changes". */
export interface PendingEdit {
  rowIndex: number;
  columnIndex: number;
  value: string;
}
