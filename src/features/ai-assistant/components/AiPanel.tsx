import React from "react";
import { Sparkles, Wand2, Gauge, Settings as SettingsIcon, X } from "lucide-react";
import { useAiStore } from "../../../state/aiStore";
import { AiSettings } from "./AiSettings";
import { Notice } from "./aiPanelShared";
import { ExplainTab } from "./ExplainTab";
import { GenerateTab } from "./GenerateTab";
import { AdvisorTab } from "./AdvisorTab";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type AiTab = "explain" | "generate" | "advisor" | "settings";

interface AiPanelProps {
  connectionId: string | null;
  currentSql: string;
  onInsertSql: (sql: string) => void;
  onClose: () => void;
}

export function AiPanel({ connectionId, currentSql, onInsertSql, onClose }: AiPanelProps) {
  const { config } = useAiStore();
  const [tab, setTab] = React.useState<AiTab>("generate");

  const ready = Boolean(config?.ready);
  const needsConnection = !connectionId;
  const disabled = !ready || needsConnection;

  const guard = !ready ? (
    <Notice tone="warning">
      AI is not configured. Open{" "}
      <button className="underline underline-offset-2" onClick={() => setTab("settings")}>
        Settings
      </button>
      , enable AI, pick a provider, and add an API key.
    </Notice>
  ) : needsConnection ? (
    <Notice tone="warning">
      No database connection is selected. Click a connection's name in the sidebar to select it —
      AI Explain and NL→SQL run against the selected database.
    </Notice>
  ) : null;

  return (
    <div className="flex h-full w-full flex-col border-l border-border bg-sidebar">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Sparkles size={14} className="text-primary" /> AI Assistant
        </div>
        <Button variant="ghost" size="icon-xs" onClick={onClose} title="Close" aria-label="Close AI assistant">
          <X />
        </Button>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as AiTab)}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="border-b border-border p-2">
          <TabsList className="w-full">
            <TabsTrigger value="explain">
              <Sparkles /> Explain
            </TabsTrigger>
            <TabsTrigger value="generate">
              <Wand2 /> NL → SQL
            </TabsTrigger>
            <TabsTrigger value="advisor">
              <Gauge /> Advisor
            </TabsTrigger>
            <TabsTrigger value="settings">
              <SettingsIcon /> Settings
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="explain" className="min-h-0">
          <ExplainTab
            connectionId={connectionId}
            disabled={disabled}
            guard={guard}
            onInsertSql={onInsertSql}
          />
        </TabsContent>
        <TabsContent value="generate" className="min-h-0">
          <GenerateTab
            connectionId={connectionId}
            disabled={disabled}
            guard={guard}
            onInsertSql={onInsertSql}
          />
        </TabsContent>
        <TabsContent value="advisor" className="min-h-0">
          <AdvisorTab
            connectionId={connectionId}
            currentSql={currentSql}
            disabled={disabled}
            guard={guard}
            onInsertSql={onInsertSql}
          />
        </TabsContent>
        <TabsContent value="settings" className="min-h-0 overflow-auto">
          <AiSettings connectionId={connectionId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
