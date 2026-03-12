import React from "react";
import { ArrowUpDown, RotateCcw } from "lucide-react";
import { cn } from "../../utils/formatters";
import { AggregateMode, ChartType, SortMode } from "./chartTypes";

interface ChartControlsProps {
  chartType: ChartType;
  setChartType: (type: ChartType) => void;
  xAxis: string;
  yAxis: string;
  allCols: string[];
  yAxisOptions: string[];
  onChangeXAxis: (value: string) => void;
  onChangeYAxis: (value: string) => void;
  aggregateMode: AggregateMode;
  setAggregateMode: (mode: AggregateMode) => void;
  sortMode: SortMode;
  setSortMode: (mode: SortMode) => void;
  topN: number | "all";
  setTopN: (value: number | "all") => void;
  onSwapAxes: () => void;
  onReset: () => void;
  pointsCount: number;
  maxInputPoints: number;
  hasRenderableData: boolean;
}

const TOP_N_OPTIONS: Array<number | "all"> = [25, 50, 100, 250, 500, 1000, "all"];

export function ChartControls({
  chartType,
  setChartType,
  xAxis,
  yAxis,
  allCols,
  yAxisOptions,
  onChangeXAxis,
  onChangeYAxis,
  aggregateMode,
  setAggregateMode,
  sortMode,
  setSortMode,
  topN,
  setTopN,
  onSwapAxes,
  onReset,
  pointsCount,
  maxInputPoints,
  hasRenderableData,
}: ChartControlsProps) {
  const supportsAggregation = chartType !== "scatter";

  return (
    <div className="flex items-center gap-3 flex-wrap px-2 py-2 border-b border-border">
      <div className="flex items-center gap-1">
        {(["bar", "line", "scatter", "pie"] as ChartType[]).map((t) => (
          <button
            key={t}
            onClick={() => setChartType(t)}
            className={cn("btn text-xs capitalize", chartType === t ? "bg-accent-blue/20 text-accent-blue" : "btn-ghost")}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="h-4 w-px bg-border" />

      <label className="flex items-center gap-1.5 text-xs text-text-muted">
        X
        <select value={xAxis} onChange={(e) => onChangeXAxis(e.target.value)} className="input text-xs py-0.5">
          {allCols.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      {chartType !== "pie" && (
        <label className="flex items-center gap-1.5 text-xs text-text-muted">
          Y
          <select value={yAxis} onChange={(e) => onChangeYAxis(e.target.value)} className="input text-xs py-0.5">
            {yAxisOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      )}

      <button onClick={onSwapAxes} className="btn-ghost text-xs flex items-center gap-1" title="Swap X and Y axes">
        <ArrowUpDown size={12} /> Swap
      </button>

      {supportsAggregation && (
        <label className="flex items-center gap-1.5 text-xs text-text-muted">
          Aggregate
          <select
            value={aggregateMode}
            onChange={(e) => setAggregateMode(e.target.value as AggregateMode)}
            className="input text-xs py-0.5"
          >
            <option value="none">None</option>
            <option value="sum">Sum</option>
            <option value="avg">Average</option>
            <option value="min">Min</option>
            <option value="max">Max</option>
            <option value="count">Count</option>
          </select>
        </label>
      )}

      <label className="flex items-center gap-1.5 text-xs text-text-muted">
        Sort
        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          className="input text-xs py-0.5"
        >
          <option value="none">None</option>
          <option value="valueDesc">Value desc</option>
          <option value="valueAsc">Value asc</option>
          <option value="labelAsc">Label A-Z</option>
          <option value="labelDesc">Label Z-A</option>
        </select>
      </label>

      <label className="flex items-center gap-1.5 text-xs text-text-muted">
        Top
        <select
          value={String(topN)}
          onChange={(e) => setTopN(e.target.value === "all" ? "all" : Number(e.target.value))}
          className="input text-xs py-0.5"
        >
          {TOP_N_OPTIONS.map((value) => (
            <option key={String(value)} value={String(value)}>
              {value === "all" ? "All" : value}
            </option>
          ))}
        </select>
      </label>

      <button onClick={onReset} className="btn-ghost text-xs flex items-center gap-1" title="Reset chart options">
        <RotateCcw size={12} /> Reset
      </button>

      {!hasRenderableData && (
        <span className="text-xs text-accent-amber">No numeric data for selected axis</span>
      )}

      <span className="text-xs text-text-muted ml-auto">
        {pointsCount.toLocaleString()} / {maxInputPoints.toLocaleString()} points
      </span>
    </div>
  );
}
