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

/** Which inline editor widget a column should use. */
export type EditKind = "text" | "number" | "boolean" | "json";

/**
 * Pick the right editing widget for a Postgres (or any) column type:
 * a true/false select for booleans, a numeric input for numbers, a multiline
 * editor for json/jsonb, and a plain text input for everything else
 * (text, uuid, dates, timestamps, network, arrays, …).
 */
export function getEditKind(dataType: string): EditKind {
  const t = dataType.toLowerCase();
  if (t.includes("json")) return "json";
  const category = getTypeCategory(dataType);
  if (category === "boolean") return "boolean";
  if (category === "numeric") return "number";
  return "text";
}

/** Return a shortened type label for display in column headers. */
export function shortTypeName(dataType: string): string {
  let t = dataType.toLowerCase().trim();
  if (!t) return "";

  // Detect & strip array notation (`_int4` or `int4[]`) — re-append "[]" later.
  let isArray = false;
  if (t.startsWith("_")) {
    isArray = true;
    t = t.slice(1);
  }
  if (/\[\s*\d*\s*\]/.test(t)) {
    isArray = true;
    t = t.replace(/\[\s*\d*\s*\]/g, "").trim();
  }
  // Drop size/precision args: "varchar(255)" -> "varchar".
  t = t.replace(/\(.*$/, "").trim();

  const map: Record<string, string> = {
    // Arrow
    utf8: "STR",
    largeutf8: "STR",
    string: "STR",
    int8: "I8",
    int16: "I16",
    int32: "I32",
    int64: "I64",
    uint8: "U8",
    uint16: "U16",
    uint32: "U32",
    uint64: "U64",
    float16: "F16",
    float32: "F32",
    float64: "F64",
    // Integers (SQL / Postgres)
    int2: "I16",
    smallint: "I16",
    smallserial: "SERIAL",
    int4: "I32",
    int: "INT",
    integer: "INT",
    serial: "SERIAL",
    mediumint: "INT",
    tinyint: "I8",
    int8range: "RANGE",
    bigint: "I64",
    bigserial: "SERIAL",
    oid: "OID",
    // Decimals / floats
    numeric: "NUM",
    decimal: "NUM",
    real: "F32",
    float4: "F32",
    "double precision": "F64",
    float: "FLOAT",
    money: "MONEY",
    // Text
    varchar: "VARCHAR",
    "character varying": "VARCHAR",
    char: "CHAR",
    bpchar: "CHAR",
    character: "CHAR",
    text: "TEXT",
    citext: "TEXT",
    clob: "TEXT",
    name: "NAME",
    uuid: "UUID",
    json: "JSON",
    jsonb: "JSONB",
    xml: "XML",
    // Boolean
    bool: "BOOL",
    boolean: "BOOL",
    bit: "BIT",
    varbit: "VARBIT",
    // Date / time
    date: "DATE",
    timestamp: "TS",
    timestamptz: "TSTZ",
    "timestamp with time zone": "TSTZ",
    "timestamp without time zone": "TS",
    datetime: "TS",
    time: "TIME",
    timetz: "TIMETZ",
    "time with time zone": "TIMETZ",
    interval: "INTVL",
    // Binary
    bytea: "BIN",
    blob: "BIN",
    binary: "BIN",
    varbinary: "BIN",
    // Network
    inet: "INET",
    cidr: "CIDR",
    macaddr: "MAC",
    macaddr8: "MAC8",
  };

  const label = map[t] ?? t.slice(0, 6).toUpperCase();
  return isArray ? `${label}[]` : label;
}
