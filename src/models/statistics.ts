export interface ColumnStats {
  column_name: string;
  data_type: string;
  null_count: number;
  distinct_count: number | null;
  min_value: unknown | null;
  max_value: unknown | null;
  mean_value: number | null;
  row_count: number;
}

export interface DatasetStats {
  dataset_id: string;
  row_count: number;
  column_stats: ColumnStats[];
}

export function nullPercent(stats: ColumnStats): number {
  if (stats.row_count === 0) return 0;
  return (stats.null_count / stats.row_count) * 100;
}

export function formatStatValue(v: unknown): string {
  if (v === null || v === undefined) return "–";
  if (typeof v === "number") return Number.isInteger(v) ? v.toString() : v.toFixed(4);
  return String(v);
}
