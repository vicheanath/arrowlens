import React, { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { cn } from "../utils/formatters";
import { isRightAligned } from "../utils/dataTypes";
import { cellToString } from "../utils/formatters";

type ChartType = "bar" | "line" | "scatter" | "pie";

interface ChartBuilderProps {
  columns: string[];
  columnTypes?: string[];
  rows: unknown[][];
  className?: string;
}

const CHART_COLORS = [
  "#89b4fa",
  "#a6e3a1",
  "#f9e2af",
  "#f38ba8",
  "#94e2d5",
  "#cba6f7",
  "#fab387",
  "#89dceb",
];

const MAX_CHART_ROWS = 2000;

export function ChartBuilder({
  columns,
  columnTypes = [],
  rows,
  className,
}: ChartBuilderProps) {
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [xAxis, setXAxis] = useState<string>(columns[0] ?? "");
  const [yAxis, setYAxis] = useState<string>(
    columns.find((_, i) => isRightAligned(columnTypes[i] ?? "")) ?? columns[1] ?? ""
  );

  const chartData = useMemo(() => {
    const xIdx = columns.indexOf(xAxis);
    const yIdx = columns.indexOf(yAxis);
    if (xIdx === -1 || yIdx === -1) return [];

    return rows.slice(0, MAX_CHART_ROWS).map((row) => ({
      x: cellToString(row[xIdx]),
      y: Number(row[yIdx]) || 0,
    }));
  }, [rows, columns, xAxis, yAxis]);

  const numericCols = columns.filter((_, i) => isRightAligned(columnTypes[i] ?? ""));
  const allCols = columns;

  const renderChart = () => {
    const commonProps = {
      data: chartData,
      margin: { top: 8, right: 16, bottom: 8, left: 0 },
    };
    const axisProps = {
      stroke: "#6c7086",
      tick: { fill: "#a6adc8", fontSize: 11 },
      axisLine: { stroke: "#2a2a3d" },
      tickLine: false,
    };

    switch (chartType) {
      case "bar":
        return (
          <BarChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
            <XAxis dataKey="x" {...axisProps} />
            <YAxis {...axisProps} />
            <Tooltip
              contentStyle={{
                background: "#181826",
                border: "1px solid #2a2a3d",
                borderRadius: 6,
                color: "#cdd6f4",
                fontSize: 12,
              }}
            />
            <Bar dataKey="y" fill={CHART_COLORS[0]} radius={[2, 2, 0, 0]} />
          </BarChart>
        );

      case "line":
        return (
          <LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
            <XAxis dataKey="x" {...axisProps} />
            <YAxis {...axisProps} />
            <Tooltip
              contentStyle={{
                background: "#181826",
                border: "1px solid #2a2a3d",
                borderRadius: 6,
                color: "#cdd6f4",
                fontSize: 12,
              }}
            />
            <Line
              type="monotone"
              dataKey="y"
              stroke={CHART_COLORS[0]}
              dot={chartData.length < 100}
              strokeWidth={2}
            />
          </LineChart>
        );

      case "scatter":
        return (
          <ScatterChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
            <XAxis dataKey="x" {...axisProps} />
            <YAxis dataKey="y" {...axisProps} />
            <Tooltip
              contentStyle={{
                background: "#181826",
                border: "1px solid #2a2a3d",
                borderRadius: 6,
                color: "#cdd6f4",
                fontSize: 12,
              }}
            />
            <Scatter data={chartData} fill={CHART_COLORS[0]} />
          </ScatterChart>
        );

      case "pie":
        return (
          <PieChart>
            <Pie
              data={chartData}
              dataKey="y"
              nameKey="x"
              cx="50%"
              cy="50%"
              outerRadius="70%"
              label={({ name, percent }) =>
                `${name}: ${(percent * 100).toFixed(1)}%`
              }
              labelLine={{ stroke: "#6c7086" }}
            >
              {chartData.map((_, index) => (
                <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "#181826",
                border: "1px solid #2a2a3d",
                borderRadius: 6,
                color: "#cdd6f4",
                fontSize: 12,
              }}
            />
          </PieChart>
        );
    }
  };

  if (!columns.length || !rows.length) {
    return (
      <div className={cn("flex items-center justify-center text-text-muted text-sm", className)}>
        Run a query to visualize results
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap px-2 py-2 border-b border-border">
        {/* Chart type */}
        <div className="flex items-center gap-1">
          {(["bar", "line", "scatter", "pie"] as ChartType[]).map((t) => (
            <button
              key={t}
              onClick={() => setChartType(t)}
              className={cn(
                "btn text-xs capitalize",
                chartType === t
                  ? "bg-accent-blue/20 text-accent-blue"
                  : "btn-ghost"
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-border" />

        {/* X Axis */}
        <label className="flex items-center gap-1.5 text-xs text-text-muted">
          X
          <select
            value={xAxis}
            onChange={(e) => setXAxis(e.target.value)}
            className="input text-xs py-0.5"
          >
            {allCols.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>

        {/* Y Axis */}
        {chartType !== "pie" && (
          <label className="flex items-center gap-1.5 text-xs text-text-muted">
            Y
            <select
              value={yAxis}
              onChange={(e) => setYAxis(e.target.value)}
              className="input text-xs py-0.5"
            >
              {(numericCols.length > 0 ? numericCols : allCols).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        )}

        <span className="text-xs text-text-muted ml-auto">
          {Math.min(rows.length, MAX_CHART_ROWS).toLocaleString()} points
        </span>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart() as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
