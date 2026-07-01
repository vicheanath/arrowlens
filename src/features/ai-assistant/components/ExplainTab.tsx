import React from "react";
import { Sparkles } from "lucide-react";
import * as aiService from "../../../services/aiService";
import { useAiStream } from "../useAiStream";
import { ResponseArea, RunButton } from "./aiPanelShared";

export function ExplainTab({
  connectionId,
  disabled,
  guard,
  onInsertSql,
}: {
  connectionId: string | null;
  disabled: boolean;
  guard: React.ReactNode;
  onInsertSql: (sql: string) => void;
}) {
  const { text, isRunning, error, run } = useAiStream();

  const onExplain = () => {
    if (!connectionId) return;
    void run((requestId) => aiService.explainSchema(requestId, connectionId));
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {guard}
      <div className="border-b border-border p-3">
        <RunButton onClick={onExplain} isRunning={isRunning} disabled={disabled} label="Explain schema" icon={<Sparkles />} />
      </div>
      <ResponseArea
        text={text}
        isRunning={isRunning}
        error={error}
        onInsertSql={onInsertSql}
        placeholder="Generate a plain-English overview of this database's tables and relationships."
      />
    </div>
  );
}
