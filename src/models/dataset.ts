export type FileType = "csv" | "parquet" | "json" | "arrow";

export interface DatasetInfo {
  id: string;
  name: string;
  source_path: string;
  file_type: FileType;
  row_count: number | null;
  size_bytes: number;
  schema_json: string | null;
  created_at: string;
}

export interface LoaderPreview {
  columns: string[];
  column_types: string[];
  rows: unknown[][];
  row_count: number;
  total_rows: number | null;
}

export interface SchemaField {
  name: string;
  data_type: string;
  nullable: boolean;
}

export interface DatasetSchema {
  dataset_id: string;
  fields: SchemaField[];
}

export type ColumnTypeCategory =
  | "string"
  | "numeric"
  | "date"
  | "timestamp"
  | "time"
  | "boolean"
  | "binary"
  | "other";

/**
 * Classify a column's declared type into a display category. Covers Arrow,
 * SQLite (type affinities) and the full PostgreSQL type vocabulary, including
 * the array (`_int4` / `int4[]`) and parameterized (`varchar(50)`) spellings
 * that drivers emit.
 */
export function getTypeCategory(dataType: string): ColumnTypeCategory {
  let t = dataType.toLowerCase().trim();
  if (!t) return "other";

  // Normalize array spellings: Postgres reports `_int4`; DDL uses `int4[]`.
  // Classify arrays by their element type.
  if (t.startsWith("_")) t = t.slice(1);
  t = t.replace(/\[\s*\d*\s*\]/g, "").trim();
  // Drop size/precision args, e.g. "varchar(50)" -> "varchar", "numeric(10,2)".
  const base = t.replace(/\(.*$/, "").trim();

  // Booleans — match before numeric so "bool" isn't caught as "int".
  if (base === "bool" || base === "boolean") return "boolean";

  // Binary blobs.
  if (
    base.includes("blob") ||
    base.includes("binary") ||
    base === "bytea" ||
    base.includes("bytes")
  ) {
    return "binary";
  }

  // Date/time — check the more specific timestamp/datetime first. Postgres
  // `interval` is a duration; group it with time-like values.
  if (base.includes("timestamp") || base.includes("datetime")) return "timestamp";
  if (base === "time" || base.startsWith("time") || base === "interval") return "time";
  if (base === "date") return "date";

  // Range types (int4range, tsrange, …) aren't scalar numerics/dates.
  if (base.endsWith("range") || base.endsWith("multirange")) return "other";

  // Numerics — Arrow (int64, float64), SQL integers (integer, int2/4/8, bigint,
  // smallint, tinyint, serial), and decimals/floats (real, double precision,
  // numeric, decimal, money), plus Postgres object identifiers (oid, reg*).
  if (
    base.includes("int") ||
    base.includes("serial") ||
    base.includes("numeric") ||
    base.includes("decimal") ||
    base.startsWith("dec") ||
    base.includes("real") ||
    base.includes("double") ||
    base.includes("float") ||
    base === "money" ||
    base === "number" ||
    base === "oid" ||
    base.startsWith("reg")
  ) {
    return "numeric";
  }

  // Strings — Arrow (utf8), SQL text (varchar, char, text, clob, citext), and
  // the many Postgres types best shown as text: uuid, json/jsonb, xml, enum,
  // network (inet/cidr/macaddr), bit strings, full-text search, geometric, etc.
  if (
    base.includes("char") ||
    base.includes("text") ||
    base.includes("string") ||
    base === "utf8" ||
    base === "largeutf8" ||
    base === "clob" ||
    base === "uuid" ||
    base === "name" ||
    base === "enum" ||
    base.includes("json") ||
    base === "xml" ||
    base === "inet" ||
    base === "cidr" ||
    base.startsWith("macaddr") ||
    base === "bit" ||
    base === "varbit" ||
    base.startsWith("ts") || // tsvector, tsquery
    base === "ltree"
  ) {
    return "string";
  }

  return "other";
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatRowCount(count: number | null): string {
  if (count === null) return "–";
  return count.toLocaleString();
}
