import React from "react";
import { Gauge } from "lucide-react";
import * as aiService from "../../../services/aiService";
import { useAiStream } from "../useAiStream";
import { ResponseArea, RunButton } from "./aiPanelShared";

export function AdvisorTab({
  connectionId,
  currentSql,
  disabled,
  guard,
  onInsertSql,
}: {
  connectionId: string | null;
  currentSql: string;
  disabled: boolean;
  guard: React.ReactNode;
  onInsertSql: (sql: string) => void;
}) {
  const { text, isRunning, error, run } = useAiStream();

  const onAdvise = () => {
    if (!connectionId || !currentSql.trim()) return;
    void run((requestId) => aiService.advisePerformance(requestId, connectionId, currentSql));
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {guard}
      <div className="flex flex-col gap-2 border-b border-border p-3">
        <RunButton
          onClick={onAdvise}
          isRunning={isRunning}
          disabled={disabled || !currentSql.trim()}
          label="Analyze current query"
          icon={<Gauge />}
        />
        <p className="text-[11px] text-muted-foreground">Uses the SQL in the editor and its EXPLAIN plan.</p>
      </div>
      <ResponseArea
        text={text}
        isRunning={isRunning}
        error={error}
        onInsertSql={onInsertSql}
        placeholder="Get index suggestions, scan/sargability warnings, and a possible rewrite for the current query."
      />
    </div>
  );
}
