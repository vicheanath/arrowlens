import { BarChart2, FileSearch, Filter, Network, Pencil, ScanSearch, Table, TableProperties, X } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { Input } from "../../../components/ui/input";
import { Button } from "../../../components/ui/button";
import { Callout } from "../../../components/ui/callout";
import { VirtualTable } from "../../../components/VirtualTable";
import { ChartBuilder } from "../../../components/ChartBuilder";
import { QueryAnalyzer } from "../../../components/analyzer/QueryAnalyzer";
import { ExplainPanel } from "../../../components/query/ExplainPanel";
import { Welcome } from "../../../components/Welcome";
import { SchemaDetailPanel } from "../../schema-explorer/components/SchemaDetailPanel";
import { SchemaEditorPanel } from "../../schema-explorer/components/SchemaEditorPanel";
import { ERDiagramPanel } from "../../schema-explorer/components/ERDiagramPanel";
import { MultiResultView } from "./MultiResultView";
import type { StatementResult } from "../../../models/query";
import { isSchemaResultTab, type ResultTab } from "../../../state/uiStore";

interface QueryResultPanelProps {
  hasCompletedResult: boolean;
  isRunning: boolean;
  displayColumns: string[];
  displayRows: unknown[][];
  displayTypes: string[];
  filteredRows: unknown[][];
  statementResults: StatementResult[];
  truncated?: boolean;
  resultTab: ResultTab;
  explainPlan: string | null;
  isExplaining: boolean;
  filterText: string;
  setFilterText: (text: string) => void;
  setResultTab: (tab: ResultTab) => void;
  onExplainRerun: (verbose: boolean) => void;
  tableAreaHeight: number;
  onLoadMore?: () => void;
  hasMoreRows?: boolean;
  isLoadingMoreRows?: boolean;
}

export function QueryResultPanel({
  hasCompletedResult,
  isRunning,
  displayColumns,
  displayRows,
  displayTypes,
  filteredRows,
  statementResults,
  truncated,
  resultTab,
  explainPlan,
  isExplaining,
  filterText,
  setFilterText,
  setResultTab,
  onExplainRerun,
  tableAreaHeight,
  onLoadMore,
  hasMoreRows,
  isLoadingMoreRows,
}: QueryResultPanelProps) {
  const isSchemaTab = isSchemaResultTab(resultTab);
  const hasResultContent =
    hasCompletedResult ||
    displayColumns.length > 0 ||
    displayRows.length > 0 ||
    statementResults.length > 0 ||
    isRunning ||
    Boolean(explainPlan);

  // Multi-statement script run → one table per result set.
  if (statementResults.length > 1) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-shrink-0 border-b border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          {statementResults.length} result sets
        </div>
        <div className="min-h-0 flex-1">
          <MultiResultView results={statementResults} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <Tabs
        value={resultTab}
        onValueChange={(value) => setResultTab(value as ResultTab)}
        className="flex-shrink-0 gap-0 border-b border-border bg-card"
      >
        <div className="flex items-center px-2">
          <TabsList variant="line" className="h-9 gap-0 bg-transparent p-0">
            <TabsTrigger value="table" className="h-full flex-none px-3 text-xs">
              <Table />
              Table
              {displayRows.length > 0 && (
                <span className="ml-1 text-muted-foreground">
                  {filteredRows.length !== displayRows.length
                    ? `${filteredRows.length.toLocaleString()} / ${displayRows.length.toLocaleString()}`
                    : displayRows.length.toLocaleString()}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="chart" className="h-full flex-none px-3 text-xs">
              <BarChart2 />
              Chart
            </TabsTrigger>
            <TabsTrigger value="analyzer" className="h-full flex-none px-3 text-xs">
              <ScanSearch />
              Analyzer
            </TabsTrigger>
            {explainPlan && (
              <TabsTrigger value="explain" className="h-full flex-none px-3 text-xs">
                <FileSearch />
                Explain
              </TabsTrigger>
            )}

            <span className="mx-1 h-4 w-px self-center bg-border" />

            <TabsTrigger value="schema_detail" className="h-full flex-none px-3 text-xs">
              <TableProperties />
              Schema
            </TabsTrigger>
            <TabsTrigger value="schema_editor" className="h-full flex-none px-3 text-xs">
              <Pencil />
              Editor
            </TabsTrigger>
            <TabsTrigger value="er_diagram" className="h-full flex-none px-3 text-xs">
              <Network />
              Diagram
            </TabsTrigger>
          </TabsList>

          {resultTab === "table" && displayRows.length > 0 && (
            <div className="ml-auto flex items-center gap-1.5">
              <Filter size={11} className="text-muted-foreground" />
              <div className="relative">
                <Input
                  type="text"
                  aria-label="Filter rows"
                  placeholder="Filter rows…"
                  value={filterText}
                  onChange={(event) => setFilterText(event.target.value)}
                  className="h-7 w-36 text-xs"
                />
                {filterText && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Clear filter"
                    onClick={() => setFilterText("")}
                    className="absolute right-0.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    <X size={11} />
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </Tabs>

      <div className="flex-1 overflow-hidden min-h-0">
        {resultTab === "schema_detail" && <SchemaDetailPanel />}
        {resultTab === "schema_editor" && <SchemaEditorPanel />}
        {resultTab === "er_diagram" && <ERDiagramPanel />}

        {!isSchemaTab && !hasResultContent && <Welcome />}

        {!isSchemaTab && hasResultContent && (
          <>
        {resultTab === "table" && (
          <div className="overflow-x-auto h-full">
            {displayColumns.length > 0 ? (
              <>
                {truncated && (
                  <Callout
                    variant="warning"
                    icon={<ScanSearch />}
                    className="flex-shrink-0 rounded-none border-x-0 border-t-0"
                  >
                    Showing the first {displayRows.length.toLocaleString()} rows — the result is larger.
                    Use <span className="font-medium">Export</span> to retrieve all rows.
                  </Callout>
                )}
                <VirtualTable
                  columns={displayColumns}
                  columnTypes={displayTypes}
                  rows={filteredRows}
                  height={truncated ? tableAreaHeight - 30 : tableAreaHeight}
                  className="h-full"
                  onLoadMore={onLoadMore}
                  hasMore={hasMoreRows}
                  isLoadingMore={isLoadingMoreRows}
                />
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground">
                <Table size={28} className="opacity-20" />
                <p className="text-sm">No rows returned</p>
                <p className="max-w-xs text-xs opacity-70">
                  The query ran successfully but matched no rows. Try loosening a{" "}
                  <span className="font-medium">WHERE</span> filter or checking your join conditions.
                </p>
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

        {resultTab === "analyzer" && (
          <QueryAnalyzer
            columns={displayColumns}
            columnTypes={displayTypes}
            rows={displayRows}
            className="h-full"
          />
        )}

        {resultTab === "explain" && explainPlan && (
          <ExplainPanel
            explainPlan={explainPlan}
            isExplaining={isExplaining}
            onRerun={onExplainRerun}
          />
        )}
          </>
        )}
      </div>
    </div>
  );
}

