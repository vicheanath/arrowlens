import { MAX_COL_WIDTH, MIN_COL_WIDTH } from "./tableTypes";

export function compareCellValues(a: unknown, b: unknown): number {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === "number" && typeof b === "number") return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === "boolean" && typeof b === "boolean") return a === b ? 0 : a ? 1 : -1;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

export function clampWidth(width: number): number {
  return Math.max(MIN_COL_WIDTH, Math.min(MAX_COL_WIDTH, width));
}

export function clampIndex(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function isPrintableKey(event: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}): boolean {
  return event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
}
