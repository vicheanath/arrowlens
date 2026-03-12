export type ChartType = "bar" | "line" | "scatter" | "pie";

export type AggregateMode = "none" | "sum" | "avg" | "min" | "max" | "count";

export type SortMode = "none" | "valueDesc" | "valueAsc" | "labelAsc" | "labelDesc";

export interface ChartDatum {
  x: string;
  y: number;
}
