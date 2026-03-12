import React from "react";
import { BarChart2, FileSearch, Filter, Play, Table, X } from "lucide-react";
import { cn } from "../../../utils/formatters";
import { VirtualTable } from "../../../components/VirtualTable";
import { ChartBuilder } from "../../../components/ChartBuilder";
import { ExplainPanel } from "../../../components/query/ExplainPanel";
import type { ResultTab } from "../../../state/uiStore";

interface QueryResultPanelProps {
  hasCompletedResult: boolean;
  isRunning: boolean;
  displayColumns: string[];
  displayRows: unknown[][];
  displayTypes: string[];
  filteredRows: unknown[][];
  resultTab: ResultTab;
  explainPlan: string | null;
  isExplaining: boolean;
  filterText: string;
  setFilterText: (text: string) => void;
  setResultTab: (tab: ResultTab) => void;
  onExplainRerun: (verbose: boolean) => void;
  tableAreaHeight: number;
}

export function QueryResultPanel({
  hasCompletedResult,
  isRunning,
  displayColumns,
  displayRows,
  displayTypes,
  filteredRows,
  resultTab,
  explainPlan,
  isExplaining,
  filterText,
  setFilterText,
  setResultTab,
  onExplainRerun,
  tableAreaHeight,
}: QueryResultPanelProps) {
  if (!(hasCompletedResult || displayColumns.length > 0 || displayRows.length > 0 || isRunning || explainPlan)) {
    return null;
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-shrink-0 flex items-center gap-0 border-b border-border bg-surface-1 px-2">
        <button
          onClick={() => setResultTab("table")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 transition-colors",
            resultTab === "table"
              ? "border-accent-blue text-accent-blue"
              : "border-transparent text-text-muted hover:text-text-secondary",
          )}
        >
          <Table size={12} />
          Table
          {displayRows.length > 0 && (
            <span className="ml-1 text-text-muted">
              {filteredRows.length !== displayRows.length
                ? `${filteredRows.length.toLocaleString()} / ${displayRows.length.toLocaleString()}`
                : displayRows.length.toLocaleString()}
            </span>
          )}
        </button>
        <button
          onClick={() => setResultTab("chart")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 transition-colors",
            resultTab === "chart"
              ? "border-accent-blue text-accent-blue"
              : "border-transparent text-text-muted hover:text-text-secondary",
          )}
        >
          <BarChart2 size={12} />
          Chart
        </button>
        {explainPlan && (
          <button
            onClick={() => setResultTab("explain")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 transition-colors",
              resultTab === "explain"
                ? "border-accent-mauve text-accent-mauve"
                : "border-transparent text-text-muted hover:text-text-secondary",
            )}
          >
            <FileSearch size={12} />
            Explain
          </button>
        )}

        {resultTab === "table" && displayRows.length > 0 && (
          <div className="ml-auto flex items-center gap-1.5 px-2">
            <Filter size={11} className="text-text-muted" />
            <input
              type="text"
              placeholder="Filter rows..."
              value={filterText}
              onChange={(event) => setFilterText(event.target.value)}
              className="text-xs bg-surface-3 border border-border rounded px-2 py-0.5 text-text-secondary placeholder:text-text-muted outline-none focus:border-accent-blue w-32"
            />
            {filterText && (
              <button onClick={() => setFilterText("")} className="text-text-muted hover:text-text-primary">
                <X size={11} />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-hidden min-h-0">
        {resultTab === "table" && (
          <div className="overflow-x-auto h-full">
            {displayColumns.length > 0 ? (
              <VirtualTable
                columns={displayColumns}
                columnTypes={displayTypes}
                rows={filteredRows}
                height={tableAreaHeight}
                className="h-full"
              />
            ) : (
              <div className="h-full flex items-center justify-center text-text-muted text-sm">
                Query completed with 0 rows returned.
              </div>
            )}
          </div>
        )}

        {resultTab === "chart" && (
          <ChartBuilder
            columns={displayColumns}
            columnTypes={displayTypes}
            rows={displayRows}
            className="h-full p-2"
          />
        )}

        {resultTab === "explain" && explainPlan && (
          <ExplainPanel
            explainPlan={explainPlan}
            isExplaining={isExplaining}
            onRerun={onExplainRerun}
          />
        )}
      </div>
    </div>
  );
}
