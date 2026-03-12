import React from "react";
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
import { ChartDatum, ChartType } from "./chartTypes";

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

const TOOLTIP_STYLE = {
  background: "#181826",
  border: "1px solid #2a2a3d",
  borderRadius: 6,
  color: "#cdd6f4",
  fontSize: 12,
};

const AXIS_PROPS = {
  stroke: "#6c7086",
  tick: { fill: "#a6adc8", fontSize: 11 },
  axisLine: { stroke: "#2a2a3d" },
  tickLine: false,
};

interface ChartCanvasProps {
  chartType: ChartType;
  data: ChartDatum[];
  pieData: ChartDatum[];
}

export function ChartCanvas({ chartType, data, pieData }: ChartCanvasProps) {
  const commonProps = {
    data,
    margin: { top: 8, right: 16, bottom: 8, left: 0 },
  };

  const renderChart = () => {
    switch (chartType) {
      case "bar":
        return (
          <BarChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
            <XAxis dataKey="x" {...AXIS_PROPS} />
            <YAxis {...AXIS_PROPS} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="y" fill={CHART_COLORS[0]} radius={[2, 2, 0, 0]} />
          </BarChart>
        );

      case "line":
        return (
          <LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
            <XAxis dataKey="x" {...AXIS_PROPS} />
            <YAxis {...AXIS_PROPS} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Line type="monotone" dataKey="y" stroke={CHART_COLORS[0]} dot={data.length < 100} strokeWidth={2} />
          </LineChart>
        );

      case "scatter":
        return (
          <ScatterChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
            <XAxis dataKey="x" {...AXIS_PROPS} />
            <YAxis dataKey="y" {...AXIS_PROPS} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Scatter data={data} fill={CHART_COLORS[0]} />
          </ScatterChart>
        );

      case "pie":
        return (
          <PieChart>
            <Pie
              data={pieData}
              dataKey="y"
              nameKey="x"
              cx="50%"
              cy="50%"
              outerRadius="70%"
              label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
              labelLine={{ stroke: "#6c7086" }}
            >
              {pieData.map((item, index) => (
                <Cell key={`${item.x}-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        );
    }
  };

  return (
    <div className="flex-1 min-h-0">
      <ResponsiveContainer width="100%" height="100%">
        {renderChart() as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}
