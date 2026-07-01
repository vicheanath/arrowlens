import { useMemo } from "react";
import { useSourceCatalog } from "../source-catalog";
import {
  attachStreamingListeners,
  loadQueryHistory,
  resolveQueryExecutionContext,
  runExplainRequest,
  runQueryMultiRequest,
  runQueryPageRequest,
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
      runQueryMultiRequest,
      runQueryPageRequest,
      runExplainRequest,
      startStreamingQueryRequest,
      attachStreamingListeners,
      loadQueryHistory,
    }),
    [activeSource],
  );
}
