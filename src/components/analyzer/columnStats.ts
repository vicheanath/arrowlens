import { cellToString } from "../../utils/formatters";
import { ColumnTypeCategory, getTypeCategory } from "../../models/dataset";
import { detectNumericColumns, toFiniteNumber } from "../chart/chartUtils";

export interface TopValue {
  value: string;
  count: number;
}

/** A per-column statistical profile of a result set. */
export interface ColumnStat {
  name: string;
  dataType: string;
  category: ColumnTypeCategory;
  isNumeric: boolean;
  total: number;
  nonNull: number;
  nulls: number;
  nullPct: number;
  distinct: number;
  distinctCapped: boolean;
  /** Numeric aggregates (null for non-numeric columns). */
  min: number | null;
  max: number | null;
  mean: number | null;
  /** Rendered-length range for non-null values. */
  minLen: number | null;
  maxLen: number | null;
  top: TopValue[];
}

// Guards against unbounded memory on very wide/high-cardinality result sets.
const DISTINCT_CAP = 100_000;
const TOP_N = 5;

interface Accumulator {
  nonNull: number;
  nulls: number;
  sum: number;
  numCount: number;
  min: number;
  max: number;
  minLen: number;
  maxLen: number;
  distinct: Set<string>;
  distinctCapped: boolean;
  freq: Map<string, number>;
}

/**
 * Profile each column of a result set in a single pass: null counts, distinct
 * cardinality, numeric aggregates, value-length range, and the most frequent
 * values. Pure and synchronous — result sets are already capped (~10k rows).
 */
export function analyzeColumns(
  columns: string[],
  columnTypes: string[],
  rows: unknown[][],
): ColumnStat[] {
  const numericSet = new Set(detectNumericColumns(rows, columns, columnTypes));
  const total = rows.length;

  const acc: Accumulator[] = columns.map(() => ({
    nonNull: 0,
    nulls: 0,
    sum: 0,
    numCount: 0,
    min: Infinity,
    max: -Infinity,
    minLen: Infinity,
    maxLen: 0,
    distinct: new Set<string>(),
    distinctCapped: false,
    freq: new Map<string, number>(),
  }));

  for (const row of rows) {
    for (let i = 0; i < columns.length; i++) {
      const a = acc[i];
      const value = row[i];
      if (value === null || value === undefined) {
        a.nulls += 1;
        continue;
      }
      a.nonNull += 1;

      const text = cellToString(value);
      if (text.length < a.minLen) a.minLen = text.length;
      if (text.length > a.maxLen) a.maxLen = text.length;

      if (!a.distinctCapped) {
        if (a.distinct.size < DISTINCT_CAP) a.distinct.add(text);
        else a.distinctCapped = true;
      }

      // Frequency only counts already-tracked keys once capped, so top-N stays
      // representative without unbounded growth.
      const seen = a.freq.get(text);
      if (seen !== undefined) a.freq.set(text, seen + 1);
      else if (a.freq.size < DISTINCT_CAP) a.freq.set(text, 1);

      if (numericSet.has(columns[i])) {
        const n = toFiniteNumber(value);
        if (n !== null) {
          a.sum += n;
          a.numCount += 1;
          if (n < a.min) a.min = n;
          if (n > a.max) a.max = n;
        }
      }
    }
  }

  return columns.map((name, i) => {
    const a = acc[i];
    const top = [...a.freq.entries()]
      .sort((x, y) => y[1] - x[1])
      .slice(0, TOP_N)
      .map(([value, count]) => ({ value, count }));

    return {
      name,
      dataType: columnTypes[i] ?? "",
      category: getTypeCategory(columnTypes[i] ?? ""),
      isNumeric: numericSet.has(name),
      total,
      nonNull: a.nonNull,
      nulls: a.nulls,
      nullPct: total > 0 ? (a.nulls / total) * 100 : 0,
      distinct: a.distinct.size,
      distinctCapped: a.distinctCapped,
      min: a.numCount > 0 ? a.min : null,
      max: a.numCount > 0 ? a.max : null,
      mean: a.numCount > 0 ? a.sum / a.numCount : null,
      minLen: a.nonNull > 0 ? a.minLen : null,
      maxLen: a.nonNull > 0 ? a.maxLen : null,
      top,
    };
  });
}
