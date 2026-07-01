import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, ArrowDownToLine } from "lucide-react";
import { cn } from "@/utils/formatters";
import { Button } from "@/components/ui/button";

/**
 * Renders an AI response written in Markdown (GitHub-flavored) with theming that
 * matches the app. Code blocks get a copy button, and SQL blocks can be inserted
 * straight into the editor when an `onInsertSql` handler is provided.
 */
interface MarkdownContextValue {
  onInsertSql?: (sql: string) => void;
}

const MarkdownContext = React.createContext<MarkdownContextValue>({});

export function Markdown({
  content,
  onInsertSql,
  className,
}: {
  content: string;
  onInsertSql?: (sql: string) => void;
  className?: string;
}) {
  const ctx = React.useMemo(() => ({ onInsertSql }), [onInsertSql]);

  return (
    <MarkdownContext.Provider value={ctx}>
      <div
        className={cn(
          "space-y-2.5 break-words text-xs leading-relaxed text-foreground/90",
          "[&_strong]:font-semibold [&_strong]:text-foreground",
          "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
          className,
        )}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => (
              <h1 className="mt-3 text-sm font-semibold text-foreground first:mt-0">{children}</h1>
            ),
            h2: ({ children }) => (
              <h2 className="mt-3 text-[13px] font-semibold text-foreground first:mt-0">{children}</h2>
            ),
            h3: ({ children }) => (
              <h3 className="mt-2.5 text-xs font-semibold text-foreground first:mt-0">{children}</h3>
            ),
            p: ({ children }) => <p className="leading-relaxed">{children}</p>,
            ul: ({ children }) => <ul className="list-disc space-y-1 pl-4 marker:text-muted-foreground">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal space-y-1 pl-4 marker:text-muted-foreground">{children}</ol>,
            li: ({ children }) => <li className="leading-relaxed">{children}</li>,
            blockquote: ({ children }) => (
              <blockquote className="border-l-2 border-border pl-3 text-muted-foreground">{children}</blockquote>
            ),
            hr: () => <hr className="border-border" />,
            a: ({ children, href }) => (
              <a href={href} target="_blank" rel="noreferrer noopener">
                {children}
              </a>
            ),
            table: ({ children }) => (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full border-collapse text-[11px]">{children}</table>
              </div>
            ),
            thead: ({ children }) => <thead className="bg-muted/50">{children}</thead>,
            th: ({ children }) => (
              <th className="border-b border-border px-2 py-1 text-left font-medium text-foreground">{children}</th>
            ),
            td: ({ children }) => <td className="border-b border-border/60 px-2 py-1 align-top">{children}</td>,
            code: CodeRenderer,
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </MarkdownContext.Provider>
  );
}

interface CodeRendererProps {
  className?: string;
  children?: React.ReactNode;
  // react-markdown passes `inline` via node context; detect block vs inline below.
  node?: { position?: unknown };
}

function CodeRenderer({ className, children }: CodeRendererProps) {
  const match = /language-(\w+)/.exec(className ?? "");
  const raw = String(children ?? "").replace(/\n$/, "");

  // Inline code: no language class and no newline.
  const isInline = !match && !raw.includes("\n");
  if (isInline) {
    return (
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground">{children}</code>
    );
  }

  return <CodeBlock language={match?.[1]} code={raw} />;
}

function CodeBlock({ language, code }: { language?: string; code: string }) {
  const { onInsertSql } = React.useContext(MarkdownContext);
  const [copied, setCopied] = React.useState(false);
  const isSql = language?.toLowerCase() === "sql";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="group relative overflow-hidden rounded-md border border-border bg-muted/40">
      <div className="flex items-center justify-between border-b border-border/60 bg-muted/40 px-2 py-1">
        <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          {language ?? "text"}
        </span>
        <div className="flex items-center gap-0.5">
          {isSql && onInsertSql && (
            <Button
              variant="ghost"
              size="icon-xs"
              title="Insert into editor"
              onClick={() => onInsertSql(code)}
            >
              <ArrowDownToLine />
            </Button>
          )}
          <Button variant="ghost" size="icon-xs" title="Copy" onClick={copy}>
            {copied ? <Check className="text-emerald-500" /> : <Copy />}
          </Button>
        </div>
      </div>
      <pre className="overflow-x-auto p-2.5 font-mono text-[11px] leading-relaxed text-foreground">
        <code>{code}</code>
      </pre>
    </div>
  );
}
