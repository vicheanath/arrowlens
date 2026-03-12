import { useMemo } from "react";
import { useSourceCatalog } from "../source-catalog";
import {
  attachStreamingListeners,
  loadQueryHistory,
  resolveQueryExecutionContext,
  runExplainRequest,
  runQueryRequest,
  startStreamingQueryRequest,
} from "./queryRuntime";

export function useQueryRuntime() {
  const { activeSource } = useSourceCatalog();

  return useMemo(
    () => ({
      activeSource,
      resolveExecutionContext: (connectionIdOverride?: string | null) =>
        resolveQueryExecutionContext(activeSource, connectionIdOverride),
      runQueryRequest,
      runExplainRequest,
      startStreamingQueryRequest,
      attachStreamingListeners,
      loadQueryHistory,
    }),
    [activeSource],
  );
}
