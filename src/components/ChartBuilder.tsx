import React from "react";
import { cn } from "../utils/formatters";
import { ChartCanvas } from "./chart/ChartCanvas";
import { ChartControls } from "./chart/ChartControls";
import { useChartModel } from "./chart/useChartModel";

interface ChartBuilderProps {
  columns: string[];
  columnTypes?: string[];
  rows: unknown[][];
  className?: string;
}

/**
 * Presentational chart builder. All state and the map → aggregate → sort → limit
 * pipeline live in `useChartModel`; this component only wires the model to the
 * controls and the canvas.
 */
export function ChartBuilder({ columns, columnTypes = [], rows, className }: ChartBuilderProps) {
  const model = useChartModel({ columns, columnTypes, rows });

  if (!columns.length || !rows.length) {
    return (
      <div className={cn("flex items-center justify-center text-muted-foreground text-sm", className)}>
        Run a query to visualize results
      </div>
    );
  }

  if (!model.hasAxisChoices) {
    return (
      <div className={cn("flex items-center justify-center text-muted-foreground text-sm", className)}>
        No columns available for charting
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <ChartControls
        chartType={model.chartType}
        setChartType={model.setChartType}
        xAxis={model.xAxis}
        yAxis={model.yAxis}
        allCols={model.allCols}
        yAxisOptions={model.yAxisOptions}
        onChangeXAxis={model.setXAxis}
        onChangeYAxis={model.setYAxis}
        aggregateMode={model.aggregateMode}
        setAggregateMode={model.setAggregateMode}
        sortMode={model.sortMode}
        setSortMode={model.setSortMode}
        topN={model.topN}
        setTopN={model.setTopN}
        onSwapAxes={model.onSwapAxes}
        onReset={model.onReset}
        pointsCount={model.computedData.length}
        maxInputPoints={model.maxInputPoints}
        hasRenderableData={model.hasRenderableData}
      />

      <ChartCanvas chartType={model.chartType} data={model.computedData} pieData={model.pieData} />
    </div>
  );
}
