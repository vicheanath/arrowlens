import React from "react";
import { AlertTriangle, Check, CheckCircle2, Copy, Loader2 } from "lucide-react";
import { Markdown } from "./Markdown";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/**
 * Presentational building blocks shared by the AI panel's tabs (Explain,
 * NL→SQL, Advisor). Extracted verbatim from AiPanel so each tab lives in its own
 * file without duplicating these.
 */

export function Notice({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "warning";
}) {
  if (tone === "warning") {
    return (
      <div className="flex items-start gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-200">
        <AlertTriangle size={13} className="mt-0.5 flex-shrink-0 text-amber-400" />
        <span>{children}</span>
      </div>
    );
  }
  return (
    <div className="border-b border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      {children}
    </div>
  );
}

/**
 * Shared output region for the streaming Markdown tabs (Explain, Advisor):
 * renders Markdown, auto-scrolls while streaming, and offers a copy button.
 */
export function ResponseArea({
  text,
  isRunning,
  error,
  placeholder,
  onInsertSql,
}: {
  text: string;
  isRunning: boolean;
  error: string | null;
  placeholder: React.ReactNode;
  onInsertSql?: (sql: string) => void;
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const pinnedRef = React.useRef(true);

  // Track whether the user is scrolled to the bottom so streaming doesn't
  // yank them back up if they scrolled away to read.
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  React.useEffect(() => {
    if (!isRunning || !pinnedRef.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text, isRunning]);

  const hasText = text.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {hasText && (
        <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
          <span className="text-[11px] text-muted-foreground">
            {isRunning ? (
              <span className="flex items-center gap-1.5">
                <Loader2 size={11} className="animate-spin" /> Generating…
              </span>
            ) : (
              "Response"
            )}
          </span>
          <CopyButton text={text} />
        </div>
      )}
      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-auto">
        {error && <ErrorBox message={error} />}
        {hasText ? (
          <div className="p-3">
            <Markdown content={text} onInsertSql={onInsertSql} />
            {isRunning && <StreamingCursor />}
          </div>
        ) : isRunning ? (
          <ThinkingIndicator />
        ) : !error ? (
          <Placeholder>{placeholder}</Placeholder>
        ) : null}
      </div>
    </div>
  );
}

export function StreamingCursor() {
  return <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-primary align-middle" />;
}

export function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
      <Loader2 size={13} className="animate-spin" /> Thinking…
    </div>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <Button variant="ghost" size="xs" onClick={copy} title="Copy response">
      {copied ? <Check className="text-emerald-500" /> : <Copy />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

export function RunButton({
  onClick,
  isRunning,
  disabled,
  label,
  icon,
}: {
  onClick: () => void;
  isRunning: boolean;
  disabled: boolean;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <Button size="sm" onClick={onClick} disabled={isRunning || disabled}>
      {isRunning ? <Loader2 className="animate-spin" /> : icon} {label}
    </Button>
  );
}

export function Placeholder({ children }: { children: React.ReactNode }) {
  return <div className="p-3 text-xs leading-relaxed text-muted-foreground">{children}</div>;
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="m-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
      <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
      <span className="break-words font-mono">{message}</span>
    </div>
  );
}

export function StatusBadge({ ok, okText, badText }: { ok: boolean; okText: string; badText: string }) {
  return (
    <Badge variant={ok ? "secondary" : "destructive"}>
      {ok ? <CheckCircle2 /> : <AlertTriangle />} {ok ? okText : badText}
    </Badge>
  );
}
