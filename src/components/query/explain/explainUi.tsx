import type { ReactNode } from "react";

export function markText(text: string, needle: string): ReactNode {
  if (!needle.trim()) return text;

  const lower = text.toLowerCase();
  const target = needle.toLowerCase();
  const parts: ReactNode[] = [];
  let start = 0;
  let cursor = lower.indexOf(target, start);

  while (cursor !== -1) {
    if (cursor > start) {
      parts.push(text.slice(start, cursor));
    }

    const end = cursor + target.length;
    parts.push(
      <mark key={`${cursor}-${end}`} className="bg-accent-yellow/30 text-foreground rounded px-0.5">
        {text.slice(cursor, end)}
      </mark>,
    );

    start = end;
    cursor = lower.indexOf(target, start);
  }

  if (start < text.length) {
    parts.push(text.slice(start));
  }

  return parts;
}

export function operatorAccent(operator: string, isAnnotation = false): string {
  if (isAnnotation) return "border-border/40 bg-card";
  const key = operator.toLowerCase();
  if (key.includes("join") || key === "nested loop") return "border-accent-mauve/50 bg-accent-mauve/10";
  if (key.includes("scan") || key.includes("bitmap")) return "border-primary/50 bg-primary/10";
  if (key.includes("aggregate") || key === "hash") return "border-accent-emerald/50 bg-accent-emerald/10";
  if (key.includes("sort") || key.includes("repartition") || key === "materialize") return "border-accent-yellow/50 bg-accent-yellow/10";
  if (key.includes("filter") || key === "limit" || key === "unique") return "border-destructive/50 bg-destructive/10";
  if (key.includes("gather")) return "border-accent-orange/50 bg-accent-orange/10";
  return "border-border/80 bg-card";
}
