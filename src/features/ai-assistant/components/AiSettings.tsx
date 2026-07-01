import React from "react";
import { BrainCircuit, Loader2, RefreshCw, Save, Sparkles } from "lucide-react";
import { AI_PROVIDER_LABELS, AiConfigUpdate, AiProvider, KnowledgeStatus } from "../../../models/ai";
import { useAiStore } from "../../../state/aiStore";
import { useToast } from "../../../utils/toast";
import { errorToMessage } from "../../../utils/errors";
import * as aiService from "../../../services/aiService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Callout } from "@/components/ui/callout";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PROVIDERS: AiProvider[] = ["anthropic", "openai", "ollama"];

const DEFAULT_MODEL: Record<AiProvider, string> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4o",
  ollama: "llama3.1",
};

export function AiSettings({ connectionId }: { connectionId: string | null }) {
  const { config, updateConfig } = useAiStore();
  const { success } = useToast();

  const [enabled, setEnabled] = React.useState(false);
  const [provider, setProvider] = React.useState<AiProvider>("anthropic");
  const [model, setModel] = React.useState("");
  const [apiKey, setApiKey] = React.useState("");
  const [baseUrl, setBaseUrl] = React.useState("");
  const [allowSampleRows, setAllowSampleRows] = React.useState(false);
  const [maxTables, setMaxTables] = React.useState(40);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!config) return;
    setEnabled(config.enabled);
    setProvider(config.provider);
    setModel(config.model);
    setBaseUrl(config.base_url ?? "");
    setAllowSampleRows(config.allow_sample_rows);
    setMaxTables(config.max_tables);
    setApiKey("");
  }, [config]);

  const onProviderChange = (next: AiProvider) => {
    setProvider(next);
    if (!model || model === DEFAULT_MODEL[provider]) {
      setModel(DEFAULT_MODEL[next]);
    }
  };

  const onSave = async () => {
    setSaving(true);
    const update: AiConfigUpdate = {
      enabled,
      provider,
      model,
      base_url: baseUrl,
      allow_sample_rows: allowSampleRows,
      max_tables: maxTables,
    };
    if (apiKey.trim().length > 0) {
      update.api_key = apiKey.trim();
    }
    const next = await updateConfig(update);
    setSaving(false);
    if (next) {
      setApiKey("");
      success("AI settings saved", undefined, 2500);
    }
  };

  const needsKey = provider !== "ollama";
  const keyOptional = provider === "openai" && baseUrl.trim().length > 0;

  return (
    <div className="flex flex-col gap-4 p-4 text-sm">
      <div className="flex items-center justify-between">
        <Label htmlFor="ai-enabled">Enable AI features</Label>
        <Switch id="ai-enabled" checked={enabled} onCheckedChange={setEnabled} />
      </div>

      <Separator />

      <div className="flex flex-col gap-1.5">
        <Label>Provider</Label>
        <Select value={provider} onValueChange={(value) => onProviderChange(value as AiProvider)}>
          <SelectTrigger className="w-full">
            <SelectValue>
              {(value: AiProvider) => AI_PROVIDER_LABELS[value] ?? value}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {PROVIDERS.map((p) => (
              <SelectItem key={p} value={p}>
                {AI_PROVIDER_LABELS[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ai-model">Model</Label>
        <Input
          id="ai-model"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={DEFAULT_MODEL[provider]}
          className="font-mono"
        />
      </div>

      {needsKey && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ai-key">
            API key{" "}
            {keyOptional && <span className="font-normal text-muted-foreground">(optional for local servers)</span>}
            {!keyOptional && config?.has_api_key && (
              <span className="font-normal text-muted-foreground">(stored — leave blank to keep)</span>
            )}
          </Label>
          <Input
            id="ai-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={config?.has_api_key ? "••••••••" : "Paste API key"}
            className="font-mono"
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ai-base-url">
          Base URL{" "}
          <span className="font-normal text-muted-foreground">
            {provider === "ollama" ? "(default http://localhost:11434)" : "(optional)"}
          </span>
        </Label>
        <Input
          id="ai-base-url"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder={provider === "ollama" ? "http://localhost:11434" : "Leave blank for default"}
          className="font-mono"
        />
      </div>

      <div className="flex items-center justify-between">
        <Label htmlFor="ai-samples" className="flex-col items-start gap-0.5">
          Allow sample rows
          <span className="text-xs font-normal text-muted-foreground">Off = schema only</span>
        </Label>
        <Switch id="ai-samples" checked={allowSampleRows} onCheckedChange={setAllowSampleRows} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ai-max-tables">Max tables in context</Label>
        <Input
          id="ai-max-tables"
          type="number"
          min={1}
          max={200}
          value={maxTables}
          onChange={(e) => setMaxTables(Number(e.target.value) || 40)}
          className="w-24"
        />
      </div>

      <Separator />

      <KnowledgeSection connectionId={connectionId} />

      <Separator />

      <p className="leading-relaxed text-muted-foreground">
        Schema (and optionally sample rows) is sent to the selected provider. Choose Ollama for fully local,
        no-egress processing.
      </p>
      <p className="leading-relaxed text-muted-foreground">
        <span className="text-foreground">LM Studio / vLLM / llama.cpp:</span> pick <b>OpenAI</b>, set Base URL to
        the server's <code>/v1</code> address (LM Studio default <code>http://localhost:1234/v1</code>), use the
        loaded model's name, and leave the API key blank.
      </p>

      <Button onClick={onSave} disabled={saving} className="self-start">
        {saving ? <Loader2 className="animate-spin" /> : <Save />} Save settings
      </Button>
    </div>
  );
}

/**
 * Per-database "knowledge base": profiles tables, writes an AI summary, and
 * embeds each for retrieval, so large-schema questions can pull in only the
 * relevant tables instead of an alphabetical cutoff, and suggestions reflect
 * real data. Building is always explicit — it samples data and makes LLM
 * calls, so it never runs automatically.
 */
function KnowledgeSection({ connectionId }: { connectionId: string | null }) {
  const toast = useToast();
  const { config } = useAiStore();
  const [status, setStatus] = React.useState<KnowledgeStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = React.useState(false);
  const [building, setBuilding] = React.useState(false);
  const [progress, setProgress] = React.useState<{ table: string; done: number; total: number } | null>(null);

  const refreshStatus = React.useCallback(async () => {
    if (!connectionId) {
      setStatus(null);
      return;
    }
    setLoadingStatus(true);
    try {
      setStatus(await aiService.getKnowledgeStatus(connectionId));
    } catch {
      setStatus(null);
    } finally {
      setLoadingStatus(false);
    }
  }, [connectionId]);

  React.useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const onBuild = async () => {
    if (!connectionId) return;
    setBuilding(true);
    setProgress(null);
    const requestId = `kb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let unlisten: (() => void) | null = null;
    try {
      unlisten = await aiService.subscribeKnowledgeProgress(requestId, (p) => setProgress(p));
      const next = await aiService.buildKnowledge(requestId, connectionId);
      setStatus(next);
      const message =
        next.profiled_count > 0
          ? `${next.table_count} table${next.table_count === 1 ? "" : "s"} covered, ${next.profiled_count} with a data profile`
          : `${next.table_count} table${next.table_count === 1 ? "" : "s"} covered — enable "Allow sample rows" to profile real data`;
      toast.success(message, "Knowledge base built", 4000);
    } catch (e) {
      toast.error(errorToMessage(e), "Couldn't build knowledge base");
    } finally {
      unlisten?.();
      setBuilding(false);
      setProgress(null);
    }
  };

  if (!connectionId) {
    return (
      <div className="flex flex-col gap-1.5">
        <Label className="flex items-center gap-1.5">
          <BrainCircuit size={13} /> Knowledge base
        </Label>
        <p className="text-xs text-muted-foreground">
          Select a database connection to build a per-database knowledge base.
        </p>
      </div>
    );
  }

  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="flex flex-col gap-2">
      <Label className="flex items-center gap-1.5">
        <BrainCircuit size={13} /> Knowledge base
      </Label>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Profiles tables, writes an AI summary, and embeds each for retrieval — so large-schema
        questions pull in only the relevant tables and suggestions reflect real data.
      </p>

      {loadingStatus ? (
        <p className="text-xs text-muted-foreground">Checking…</p>
      ) : status?.exists ? (
        <div className="rounded-md border border-border bg-muted/30 px-2.5 py-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-foreground/85">
              {status.table_count} table{status.table_count === 1 ? "" : "s"} covered
              {status.embedding_kind && (
                <span className="ml-1 text-muted-foreground">
                  · {status.embedding_kind === "vector" ? "semantic" : "keyword"} retrieval
                </span>
              )}
            </span>
            {!status.is_current && <span className="flex-shrink-0 text-warning">Schema changed</span>}
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {status.profiled_count} of {status.table_count} have a sampled data profile
          </div>
          {status.built_at && (
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              Built {new Date(status.built_at).toLocaleString()}
              {status.model && ` with ${status.model}`}
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Not built yet.</p>
      )}

      {status?.exists && status.profiled_count === 0 && (
        <Callout variant="warning">
          No tables have a sampled data profile, so suggestions and answers are grounded in structure
          only, not real data. Turn on <span className="font-medium">Allow sample rows</span> above,
          then rebuild.
        </Callout>
      )}

      {status?.exists && status.provider && status.provider !== config?.provider && (
        <Callout variant="warning">
          Built with {AI_PROVIDER_LABELS[status.provider]} — the current provider's embeddings aren't
          comparable, so retrieval falls back to plain matching until you rebuild.
        </Callout>
      )}

      {building && progress && (
        <div className="flex flex-col gap-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="truncate text-[11px] text-muted-foreground">
            {progress.done}/{progress.total} — {progress.table}
          </span>
        </div>
      )}

      <Button variant="outline" size="sm" onClick={() => void onBuild()} disabled={building} className="self-start">
        {building ? <Loader2 className="animate-spin" /> : status?.exists ? <RefreshCw /> : <Sparkles />}
        {building ? "Building…" : status?.exists ? "Refresh knowledge" : "Build knowledge"}
      </Button>
    </div>
  );
}
