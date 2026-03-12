import { useMemo } from "react";
import { QueryResult } from "../../models/query";

interface StreamingState {
  queryId: string | null;
  columns: string[];
  rows: unknown[][];
  isDone: boolean;
}

interface UseQueryResultPresentationArgs {
  isStreaming: boolean;
  streaming: StreamingState;
  result: QueryResult | null;
  filterText: string;
  containerHeight: number;
}

export function useQueryResultPresentation({
  isStreaming,
  streaming,
  result,
  filterText,
  containerHeight,
}: UseQueryResultPresentationArgs) {
  const displayRows = isStreaming ? streaming.rows : result?.rows ?? [];
  const displayColumns = isStreaming ? streaming.columns : result?.columns ?? [];
  const displayTypes = isStreaming ? [] : result?.column_types ?? [];

  const filteredRows = useMemo(() => {
    if (!filterText.trim()) return displayRows;
    const needle = filterText.toLowerCase();
    return displayRows.filter((row) => row.some((cell) => String(cell ?? "").toLowerCase().includes(needle)));
  }, [displayRows, filterText]);

  const tableAreaHeight = Math.max(200, containerHeight - 320);
  const hasCompletedResult = Boolean(result) || (isStreaming && streaming.isDone);

  return {
    displayRows,
    displayColumns,
    displayTypes,
    filteredRows,
    tableAreaHeight,
    hasCompletedResult,
  };
}
