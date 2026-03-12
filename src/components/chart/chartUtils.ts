import { cellToString } from "../../utils/formatters";
import { AggregateMode, ChartDatum, SortMode } from "./chartTypes";

export function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const normalized = trimmed.replace(/,/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function mapRowsToData(
  rows: unknown[][],
  xIndex: number,
  yIndex: number,
  maxRows: number,
): ChartDatum[] {
  const next: ChartDatum[] = [];
  for (const row of rows.slice(0, maxRows)) {
    const y = toFiniteNumber(row[yIndex]);
    if (y === null) continue;
    next.push({
      x: cellToString(row[xIndex]),
      y,
    });
  }
  return next;
}

export function aggregateData(data: ChartDatum[], mode: AggregateMode): ChartDatum[] {
  if (mode === "none") return data;

  const grouped = new Map<string, { sum: number; count: number; min: number; max: number }>();

  for (const item of data) {
    const existing = grouped.get(item.x);
    if (!existing) {
      grouped.set(item.x, {
        sum: item.y,
        count: 1,
        min: item.y,
        max: item.y,
      });
      continue;
    }

    existing.sum += item.y;
    existing.count += 1;
    existing.min = Math.min(existing.min, item.y);
    existing.max = Math.max(existing.max, item.y);
  }

  const result: ChartDatum[] = [];
  for (const [x, stats] of grouped.entries()) {
    let y: number;
    switch (mode) {
      case "sum":
        y = stats.sum;
        break;
      case "avg":
        y = stats.sum / stats.count;
        break;
      case "min":
        y = stats.min;
        break;
      case "max":
        y = stats.max;
        break;
      case "count":
        y = stats.count;
        break;
      default:
        y = stats.sum;
    }

    result.push({ x, y });
  }

  return result;
}

export function sortData(data: ChartDatum[], mode: SortMode): ChartDatum[] {
  if (mode === "none") return data;

  const next = [...data];
  switch (mode) {
    case "valueDesc":
      next.sort((a, b) => b.y - a.y);
      break;
    case "valueAsc":
      next.sort((a, b) => a.y - b.y);
      break;
    case "labelAsc":
      next.sort((a, b) => a.x.localeCompare(b.x));
      break;
    case "labelDesc":
      next.sort((a, b) => b.x.localeCompare(a.x));
      break;
    default:
      break;
  }

  return next;
}

export function limitData(data: ChartDatum[], topN: number | "all"): ChartDatum[] {
  if (topN === "all") return data;
  return data.slice(0, topN);
}
