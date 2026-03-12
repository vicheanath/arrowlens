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

export function getTypeCategory(dataType: string): ColumnTypeCategory {
  const t = dataType.toLowerCase();
  if (t === "boolean") return "boolean";
  if (["string", "utf8", "largeutf8"].includes(t)) return "string";
  if (["date"].includes(t)) return "date";
  if (t === "timestamp") return "timestamp";
  if (t === "time") return "time";
  if (["binary", "largebinary"].includes(t)) return "binary";
  if (
    [
      "int8", "int16", "int32", "int64",
      "uint8", "uint16", "uint32", "uint64",
      "float32", "float64", "float16",
    ].includes(t) ||
    t.startsWith("decimal")
  )
    return "numeric";
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
