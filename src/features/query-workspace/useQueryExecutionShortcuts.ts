import { RefObject } from "react";
import { EditorView } from "@uiw/react-codemirror";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";

interface UseQueryExecutionShortcutsArgs {
  editorViewRef: RefObject<EditorView | null>;
  activeTabSql: string;
  sql: string;
  selectedConnectionId: string | null;
  runQuery: (connectionIdOverride?: string | null, sqlOverride?: string) => Promise<void>;
  runStreamingQuery: (connectionIdOverride?: string | null, sqlOverride?: string) => Promise<void>;
}

export function getSelectedSql(editorViewRef: RefObject<EditorView | null>): string | null {
  const view = editorViewRef.current;
  if (!view) return null;

  const selection = view.state.selection.main;
  if (selection.empty) return null;

  const selected = view.state.sliceDoc(selection.from, selection.to).trim();
  return selected.length > 0 ? selected : null;
}

export function useQueryExecutionShortcuts({
  editorViewRef,
  activeTabSql,
  sql,
  selectedConnectionId,
  runQuery,
  runStreamingQuery,
}: UseQueryExecutionShortcutsArgs) {
  const runWithSelectionFallback = (streamingMode: boolean) => {
    const selectedSql = getSelectedSql(editorViewRef);
    const queryText = selectedSql ?? activeTabSql ?? sql;
    if (streamingMode) {
      void runStreamingQuery(selectedConnectionId, queryText);
    } else {
      void runQuery(selectedConnectionId, queryText);
    }
  };

  const runSelectedOnly = () => {
    const selectedSql = getSelectedSql(editorViewRef);
    if (!selectedSql) return;
    void runQuery(selectedConnectionId, selectedSql);
  };

  useKeyboardShortcuts([
    { key: "Enter", meta: true, handler: () => runWithSelectionFallback(false) },
    { key: "Enter", meta: true, shift: true, handler: () => runWithSelectionFallback(true) },
  ]);

  return {
    runWithSelectionFallback,
    runSelectedOnly,
    getSelectedSql: () => getSelectedSql(editorViewRef),
  };
}
