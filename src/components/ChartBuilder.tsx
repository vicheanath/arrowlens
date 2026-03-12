import React, { useEffect, useMemo, useState } from "react";
import { cn } from "../utils/formatters";
import { isRightAligned } from "../utils/dataTypes";
import { ChartCanvas } from "./chart/ChartCanvas";
import { ChartControls } from "./chart/ChartControls";
import { AggregateMode, ChartType, SortMode } from "./chart/chartTypes";
import { aggregateData, limitData, mapRowsToData, sortData } from "./chart/chartUtils";

interface ChartBuilderProps {
  columns: string[];
  columnTypes?: string[];
  rows: unknown[][];
  className?: string;
}

const MAX_CHART_ROWS = 2000;
const MAX_PIE_SLICES = 12;

export function ChartBuilder({
  columns,
  columnTypes = [],
  rows,
  className,
}: ChartBuilderProps) {
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [aggregateMode, setAggregateMode] = useState<AggregateMode>("sum");
  const [sortMode, setSortMode] = useState<SortMode>("valueDesc");
  const [topN, setTopN] = useState<number | "all">(100);

  const allCols = columns;
  const numericCols = useMemo(
    () => columns.filter((_, i) => isRightAligned(columnTypes[i] ?? "")),
    [columns, columnTypes],
  );
  const yAxisOptions = numericCols.length > 0 ? numericCols : allCols;

  const [xAxis, setXAxis] = useState<string>(allCols[0] ?? "");
  const [yAxis, setYAxis] = useState<string>(
    yAxisOptions[0] ?? allCols[1] ?? allCols[0] ?? "",
  );

  useEffect(() => {
    if (chartType === "scatter" && aggregateMode !== "none") {
      setAggregateMode("none");
    }
  }, [aggregateMode, chartType]);

  useEffect(() => {
    const nextX = allCols[0] ?? "";
    if (!allCols.includes(xAxis)) {
      setXAxis(nextX);
    }
  }, [allCols, xAxis]);

  useEffect(() => {
    const nextY = yAxisOptions[0] ?? allCols[1] ?? allCols[0] ?? "";
    if (!yAxisOptions.includes(yAxis)) {
      setYAxis(nextY);
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

  const hasAxisChoices = allCols.length > 0 && yAxisOptions.length > 0;
  const hasRenderableData = computedData.length > 0;

  const onReset = () => {
    const defaultX = allCols[0] ?? "";
    const defaultY = yAxisOptions[0] ?? allCols[1] ?? allCols[0] ?? "";
    setXAxis(defaultX);
    setYAxis(defaultY);
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

  if (!allCols.length || !rows.length) {
    return (
      <div className={cn("flex items-center justify-center text-text-muted text-sm", className)}>
        Run a query to visualize results
      </div>
    );
  }

  if (!hasAxisChoices) {
    return (
      <div className={cn("flex items-center justify-center text-text-muted text-sm", className)}>
        No columns available for charting
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <ChartControls
        chartType={chartType}
        setChartType={setChartType}
        xAxis={xAxis}
        yAxis={yAxis}
        allCols={allCols}
        yAxisOptions={yAxisOptions}
        onChangeXAxis={setXAxis}
        onChangeYAxis={setYAxis}
        aggregateMode={aggregateMode}
        setAggregateMode={setAggregateMode}
        sortMode={sortMode}
        setSortMode={setSortMode}
        topN={topN}
        setTopN={setTopN}
        onSwapAxes={onSwapAxes}
        onReset={onReset}
        pointsCount={computedData.length}
        maxInputPoints={Math.min(rows.length, MAX_CHART_ROWS)}
        hasRenderableData={hasRenderableData}
      />

      <ChartCanvas chartType={chartType} data={computedData} pieData={pieData} />
    </div>
  );
}
