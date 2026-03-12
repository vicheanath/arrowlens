import { ColumnTypeCategory, getTypeCategory } from "../models/dataset";

export { getTypeCategory };

export const TYPE_COLORS: Record<ColumnTypeCategory, string> = {
  string:    "text-accent-green",
  numeric:   "text-accent-blue",
  date:      "text-accent-yellow",
  timestamp: "text-accent-yellow",
  time:      "text-accent-yellow",
  boolean:   "text-accent-mauve",
  binary:    "text-text-muted",
  other:     "text-text-muted",
};

export const TYPE_TAG_CLASS: Record<ColumnTypeCategory, string> = {
  string:    "tag-string",
  numeric:   "tag-numeric",
  date:      "tag-date",
  timestamp: "tag-date",
  time:      "tag-date",
  boolean:   "tag-boolean",
  binary:    "tag-binary",
  other:     "tag-other",
};

/** Decide whether a column's values should be right-aligned (numeric). */
export function isRightAligned(dataType: string): boolean {
  return getTypeCategory(dataType) === "numeric";
}

/** Return a shortened type label for display in column headers. */
export function shortTypeName(dataType: string): string {
  const t = dataType.toLowerCase();
  const map: Record<string, string> = {
    string: "STR",
    utf8: "STR",
    largeutf8: "STR",
    int8: "I8",
    int16: "I16",
    int32: "I32",
    int64: "I64",
    uint8: "U8",
    uint16: "U16",
    uint32: "U32",
    uint64: "U64",
    float32: "F32",
    float64: "F64",
    boolean: "BOOL",
    date: "DATE",
    timestamp: "TS",
    time: "TIME",
    binary: "BIN",
  };
  return map[t] ?? t.slice(0, 4).toUpperCase();
}
