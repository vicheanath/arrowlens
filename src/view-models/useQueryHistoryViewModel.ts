import { useMemo } from "react";
import { useQueryStore } from "../state/queryStore";

export function useQueryHistoryViewModel() {
  const { history, loadFromHistory } = useQueryStore();
  return useMemo(
    () => ({ history, loadFromHistory, isEmpty: history.length === 0 }),
    [history, loadFromHistory],
  );
}
