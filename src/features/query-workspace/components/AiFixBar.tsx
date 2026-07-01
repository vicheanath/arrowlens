import React from "react";
import {
  AlertTriangle,
  X,
  Wand2,
  Loader2,
  ArrowDownToLine,
  CheckCircle2,
} from "lucide-react";
import { useAiStore } from "../../../state/aiStore";
import { NlSqlResult } from "../../../models/ai";
import * as aiService from "../../../services/aiService";
import { useAiStream } from "../../ai-assistant/useAiStream";
import { diffLines, DiffLine } from "../../../utils/diff";
import { cn } from "../../../utils/formatters";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface AiFixBarProps {
  error: string;
  sql: string;
  connectionId: string | null;
  onApply: (sql: string) => void;
  onDismiss: () => void;
}

/**
 * Query-error bar with an inline "Fix with AI" flow: asks the model to correct
 * the failing query, shows a before/after diff, and applies the fix into the
 * editor on demand (Cmd/Ctrl+Enter to apply, Esc to discard).
 */
export function AiFixBar({ error, sql, connectionId, onApply, onDismiss }: AiFixBarProps) {
  const { config } = useAiStore();
  const { isRunning, run } = useAiStream();
  const [result, setResult] = React.useState<NlSqlResult | null>(null);
  const previewRef = React.useRef<HTMLDivElement>(null);

  const ready = Boolean(config?.ready);
  const canFix = ready && Boolean(connectionId) && sql.trim().length > 0;

  const onFix = async () => {
    if (!connectionId) return;
    setResult(null);
    const res = await run((requestId) => aiService.fixSql(requestId, connectionId, sql, error));
    if (res) setResult(res);
  };

  // Move focus to the preview so the keyboard shortcuts work immediately.
  React.useEffect(() => {
    if (result) previewRef.current?.focus();
  }, [result]);

  if (result) {
    const diff = diffLines(sql, result.sql);
    const validated = result.validation.parsed && result.validation.read_only;

    return (
      <div
        ref={previewRef}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            setResult(null);
          } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onApply(result.sql);
          }
        }}
        className="flex-shrink-0 border-b border-primary/30 bg-primary/5 outline-none"
      >
        <div className="flex items-center justify-between gap-2 border-b border-primary/20 px-3 py-1.5">
          <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
            <Wand2 size={13} /> AI suggested fix
          </span>
          <div className="flex items-center gap-1.5">
            {result.explain_ok ? (
              <Badge variant="secondary">
                <CheckCircle2 /> Verified
              </Badge>
            ) : !validated ? (
              <Badge variant="destructive">
                <AlertTriangle /> Review
              </Badge>
            ) : null}
            {result.repaired && <Badge variant="secondary">self-repaired</Badge>}
            <Button variant="ghost" size="xs" onClick={() => setResult(null)}>
              Discard
            </Button>
            <Button size="xs" onClick={() => onApply(result.sql)}>
              <ArrowDownToLine /> Apply
            </Button>
          </div>
        </div>

        <div className="max-h-48 overflow-auto py-1 font-mono text-xs leading-relaxed">
          {diff.map((line, i) => (
            <DiffRow key={i} line={line} />
          ))}
        </div>

        <div className="px-3 py-1 text-[10px] text-muted-foreground">
          ⌘/Ctrl+Enter apply · Esc discard
          {result.validation.message && (
            <span className="ml-2 text-amber-300">{result.validation.message}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-shrink-0 flex items-start gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
      <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
      <span className="flex-1 break-words font-mono">{error}</span>
      {canFix && (
        <Button
          size="xs"
          onClick={() => void onFix()}
          disabled={isRunning}
          className="flex-shrink-0"
          title="Ask AI to fix this query based on the error and schema"
        >
          {isRunning ? <Loader2 className="animate-spin" /> : <Wand2 />}
          {isRunning ? "Fixing…" : "Fix with AI"}
        </Button>
      )}
      <button
        onClick={onDismiss}
        className="flex-shrink-0 hover:opacity-80"
        title="Dismiss error"
      >
        <X size={12} />
      </button>
    </div>
  );
}

function DiffRow({ line }: { line: DiffLine }) {
  const sign = line.type === "add" ? "+" : line.type === "remove" ? "-" : " ";
  return (
    <div
      className={cn(
        "flex gap-2 px-3",
        line.type === "add" && "bg-emerald-500/10 text-emerald-300",
        line.type === "remove" && "bg-destructive/10 text-destructive",
        line.type === "same" && "text-muted-foreground",
      )}
    >
      <span className="select-none opacity-50">{sign}</span>
      <span className="whitespace-pre-wrap break-words">{line.text || " "}</span>
    </div>
  );
}
