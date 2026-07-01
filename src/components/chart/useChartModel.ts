import { useEffect, useMemo, useState } from "react";
import { AggregateMode, ChartDatum, ChartType, SortMode } from "./chartTypes";
import {
  aggregateData,
  detectNumericColumns,
  limitData,
  mapRowsToData,
  sortData,
} from "./chartUtils";

const MAX_CHART_ROWS = 2000;
const MAX_PIE_SLICES = 12;

export interface ChartModelInput {
  columns: string[];
  columnTypes: string[];
  rows: unknown[][];
}

export interface ChartModel {
  chartType: ChartType;
  setChartType: (type: ChartType) => void;
  aggregateMode: AggregateMode;
  setAggregateMode: (mode: AggregateMode) => void;
  sortMode: SortMode;
  setSortMode: (mode: SortMode) => void;
  topN: number | "all";
  setTopN: (value: number | "all") => void;

  xAxis: string;
  yAxis: string;
  allCols: string[];
  yAxisOptions: string[];
  setXAxis: (value: string) => void;
  setYAxis: (value: string) => void;

  computedData: ChartDatum[];
  pieData: ChartDatum[];
  hasAxisChoices: boolean;
  hasRenderableData: boolean;
  maxInputPoints: number;

  onReset: () => void;
  onSwapAxes: () => void;
}

/**
 * All chart state and derived data. Keeping it here lets `ChartBuilder` stay a
 * thin presentational shell and makes the pipeline (map → aggregate → sort →
 * limit) easy to test and reason about in isolation.
 */
export function useChartModel({ columns, columnTypes, rows }: ChartModelInput): ChartModel {
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [aggregateMode, setAggregateMode] = useState<AggregateMode>("sum");
  const [sortMode, setSortMode] = useState<SortMode>("valueDesc");
  const [topN, setTopN] = useState<number | "all">(100);

  const allCols = columns;
  const numericCols = useMemo(
    () => detectNumericColumns(rows, columns, columnTypes),
    [rows, columns, columnTypes],
  );
  const yAxisOptions = numericCols.length > 0 ? numericCols : allCols;

  const [xAxis, setXAxis] = useState<string>(allCols[0] ?? "");
  const [yAxis, setYAxis] = useState<string>(yAxisOptions[0] ?? allCols[1] ?? allCols[0] ?? "");

  // Scatter plots show raw points, not aggregates.
  useEffect(() => {
    if (chartType === "scatter" && aggregateMode !== "none") {
      setAggregateMode("none");
    }
  }, [aggregateMode, chartType]);

  // Keep axis selections valid as the result set's columns change.
  useEffect(() => {
    if (!allCols.includes(xAxis)) setXAxis(allCols[0] ?? "");
  }, [allCols, xAxis]);

  useEffect(() => {
    if (!yAxisOptions.includes(yAxis)) {
      setYAxis(yAxisOptions[0] ?? allCols[1] ?? allCols[0] ?? "");
    }
  }, [allCols, yAxis, yAxisOptions]);

  const rawData = useMemo(() => {
    const xIdx = allCols.indexOf(xAxis);
    const yIdx = allCols.indexOf(yAxis);
    if (xIdx === -1 || yIdx === -1) return [];
    return mapRowsToData(rows, xIdx, yIdx, MAX_CHART_ROWS);
  }, [rows, allCols, xAxis, yAxis]);

  const computedData = useMemo(() => {
    const maybeAggregated = chartType === "scatter" ? rawData : aggregateData(rawData, aggregateMode);
    const sorted = sortData(maybeAggregated, sortMode);
    return limitData(sorted, topN);
  }, [aggregateMode, chartType, rawData, sortMode, topN]);

  const pieData = useMemo(() => {
    if (computedData.length <= MAX_PIE_SLICES) return computedData;
    const sorted = [...computedData].sort((a, b) => b.y - a.y);
    const top = sorted.slice(0, MAX_PIE_SLICES - 1);
    const otherTotal = sorted.slice(MAX_PIE_SLICES - 1).reduce((sum, item) => sum + item.y, 0);
    return [...top, { x: "Other", y: otherTotal }];
  }, [computedData]);

  const onReset = () => {
    setXAxis(allCols[0] ?? "");
    setYAxis(yAxisOptions[0] ?? allCols[1] ?? allCols[0] ?? "");
    setChartType("bar");
    setAggregateMode("sum");
    setSortMode("valueDesc");
    setTopN(100);
  };

  const onSwapAxes = () => {
    if (!xAxis || !yAxis) return;
    if (!allCols.includes(yAxis)) return;
    if (!yAxisOptions.includes(xAxis)) return;
    setXAxis(yAxis);
    setYAxis(xAxis);
  };

  return {
    chartType,
    setChartType,
    aggregateMode,
    setAggregateMode,
    sortMode,
    setSortMode,
    topN,
    setTopN,
    xAxis,
    yAxis,
    allCols,
    yAxisOptions,
    setXAxis,
    setYAxis,
    computedData,
    pieData,
    hasAxisChoices: allCols.length > 0 && yAxisOptions.length > 0,
    hasRenderableData: computedData.length > 0,
    maxInputPoints: Math.min(rows.length, MAX_CHART_ROWS),
    onReset,
    onSwapAxes,
  };
}
