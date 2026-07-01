import React from "react";
import { Wand2, ArrowDownToLine, ChevronDown, ChevronRight, Loader2, RefreshCw, Lightbulb } from "lucide-react";
import { NlSqlResult, SuggestedQuery } from "../../../models/ai";
import * as aiService from "../../../services/aiService";
import { errorToMessage } from "../../../utils/errors";
import { useAiStream } from "../useAiStream";
import { Markdown } from "./Markdown";
import { ErrorBox, Placeholder, RunButton, StatusBadge, StreamingCursor } from "./aiPanelShared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";

export function GenerateTab({
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
  const [question, setQuestion] = React.useState("");
  const [result, setResult] = React.useState<NlSqlResult | null>(null);
  const [suggestions, setSuggestions] = React.useState<SuggestedQuery[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = React.useState(false);
  const [suggestError, setSuggestError] = React.useState<string | null>(null);

  const onGenerate = async () => {
    if (!connectionId || !question.trim()) return;
    setResult(null);
    const res = await run((requestId) => aiService.generateSql(requestId, connectionId, question.trim()));
    if (res) setResult(res);
  };

  const loadSuggestions = React.useCallback(async () => {
    if (!connectionId) return;
    setLoadingSuggestions(true);
    setSuggestError(null);
    try {
      setSuggestions(await aiService.suggestQuestions(connectionId));
    } catch (e) {
      setSuggestError(errorToMessage(e));
    } finally {
      setLoadingSuggestions(false);
    }
  }, [connectionId]);

  // Auto-load recommended prompts once AI is ready and a connection is chosen.
  // The backend caches by schema hash, so this is instant after the first call.
  const autoLoadedFor = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (disabled || !connectionId) return;
    if (autoLoadedFor.current === connectionId) return;
    autoLoadedFor.current = connectionId;
    void loadSuggestions();
  }, [disabled, connectionId, loadSuggestions]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {guard}
      <div className="flex flex-col gap-2 border-b border-border p-3">
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void onGenerate();
            }
          }}
          placeholder="Ask a question, e.g. 'top 10 customers by total payment in 2005'"
          rows={3}
          className="resize-none text-xs"
        />
        <div className="flex items-center gap-2">
          <RunButton onClick={() => void onGenerate()} isRunning={isRunning} disabled={disabled || !question.trim()} label="Generate SQL" icon={<Wand2 />} />
          <span className="text-[11px] text-muted-foreground">⌘/Ctrl + Enter</span>
        </div>

        <SuggestionCards
          suggestions={suggestions}
          loading={loadingSuggestions}
          error={suggestError}
          disabled={disabled}
          onInsert={onInsertSql}
          onLoad={() => void loadSuggestions()}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {error && <ErrorBox message={error} />}
        {result ? (
          <GeneratedResult result={result} onInsertSql={onInsertSql} />
        ) : isRunning ? (
          <div className="p-3">
            <Markdown content={text} onInsertSql={onInsertSql} />
            <StreamingCursor />
          </div>
        ) : !error ? (
          <Placeholder>Generated SQL is reviewed and validated before you run it — it is never executed automatically.</Placeholder>
        ) : null}
      </div>
    </div>
  );
}

function GeneratedResult({
  result,
  onInsertSql,
}: {
  result: NlSqlResult;
  onInsertSql: (sql: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 p-3">
      <Markdown content={"```sql\n" + result.sql + "\n```"} onInsertSql={onInsertSql} />
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge ok={result.validation.read_only && result.validation.parsed} okText="Read-only & parsed" badText="Validation issue" />
        <StatusBadge ok={result.explain_ok} okText="EXPLAIN passed" badText="EXPLAIN not verified" />
        {result.repaired && <Badge variant="secondary">self-repaired</Badge>}
      </div>
      {result.validation.message && (
        <p className="text-[11px] text-muted-foreground">{result.validation.message}</p>
      )}
      {result.explain_error && (
        <p className="text-[11px] text-muted-foreground">EXPLAIN: {result.explain_error}</p>
      )}
      <Separator className="my-1" />
      <Button variant="outline" size="sm" className="self-start" onClick={() => onInsertSql(result.sql)}>
        <ArrowDownToLine /> Insert into editor
      </Button>
    </div>
  );
}

/**
 * Data-aware suggestions: each is a ready-to-run SQL answer to a question,
 * not just question text to re-type. Clicking a card expands its SQL preview;
 * Insert drops the SQL straight into the editor (never auto-runs it).
 */
function SuggestionCards({
  suggestions,
  loading,
  error,
  disabled,
  onInsert,
  onLoad,
}: {
  suggestions: SuggestedQuery[];
  loading: boolean;
  error: string | null;
  disabled: boolean;
  onInsert: (sql: string) => void;
  onLoad: () => void;
}) {
  const [attempted, setAttempted] = React.useState(false);
  const [expanded, setExpanded] = React.useState<Set<number>>(new Set());
  React.useEffect(() => {
    if (loading) setAttempted(true);
  }, [loading]);

  const toggle = (i: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const hasLoaded = suggestions.length > 0 || error !== null;

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={onLoad}
        disabled={disabled || loading}
        className="flex items-center gap-1.5 self-start text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        title="Let AI suggest questions based on this database's schema and data"
      >
        {loading ? (
          <Loader2 size={12} className="animate-spin" />
        ) : hasLoaded ? (
          <RefreshCw size={12} />
        ) : (
          <Lightbulb size={12} className="text-amber-400" />
        )}
        {loading ? "Thinking…" : hasLoaded ? "Suggest more" : "Suggest questions"}
      </button>

      {error && <p className="text-[11px] text-destructive">{error}</p>}

      {!loading && !error && attempted && suggestions.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          No suggestions returned — try again.
        </p>
      )}

      {suggestions.length > 0 && (
        <div className="flex flex-col gap-1">
          {suggestions.map((s, i) => {
            const isOpen = expanded.has(i);
            return (
              <div key={`${i}-${s.question}`} className="rounded-md border border-border bg-muted/30">
                <div className="flex items-start gap-1.5 p-1.5">
                  <button
                    type="button"
                    onClick={() => toggle(i)}
                    className="flex min-w-0 flex-1 items-start gap-1 text-left"
                    title="Show SQL"
                  >
                    <span className="mt-0.5 flex-shrink-0 text-muted-foreground">
                      {isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] leading-snug text-foreground/90">{s.question}</span>
                      {s.rationale && (
                        <span className="mt-0.5 block text-[10px] italic leading-snug text-muted-foreground">
                          {s.rationale}
                        </span>
                      )}
                    </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="flex-shrink-0"
                    onClick={() => onInsert(s.sql)}
                    title="Insert into editor"
                  >
                    <ArrowDownToLine />
                    Insert
                  </Button>
                </div>
                {isOpen && (
                  <pre className="overflow-x-auto border-t border-border/60 bg-muted/40 px-2 py-1.5 font-mono text-[10px] text-foreground/80">
                    {s.sql}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
