import { useMemo } from "react";
import { useQueryHistoryStore } from "../state/queryStore";

export function useQueryHistoryViewModel() {
  const { history, loadFromHistory } = useQueryHistoryStore();
  return useMemo(
    () => ({ history, loadFromHistory, isEmpty: history.length === 0 }),
    [history, loadFromHistory],
  );
}
