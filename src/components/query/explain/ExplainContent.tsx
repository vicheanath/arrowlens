import { cn } from "../../../utils/formatters";
import { markText, operatorAccent } from "./explainUi";
import { ExplainNode, ExplainViewMode } from "./types";

interface ExplainContentProps {
  explainPlan: string;
  query: string;
  viewMode: ExplainViewMode;
  wrap: boolean;
  nodes: ExplainNode[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

export function ExplainContent({
  explainPlan,
  query,
  viewMode,
  wrap,
  nodes,
  selectedNodeId,
  onSelectNode,
}: ExplainContentProps) {
  if (viewMode === "text") {
    return (
      <pre className={cn("text-xs font-mono text-foreground/80 leading-5", wrap ? "whitespace-pre-wrap" : "whitespace-pre")}>
        {markText(explainPlan, query)}
      </pre>
    );
  }

  if (viewMode === "tree") {
    return (
      <div className="space-y-1">
        {nodes.map((node) => (
          <button
            key={node.id}
            onClick={() => onSelectNode(node.id)}
            className={cn(
              "w-full text-left text-xs rounded border px-2 py-1.5 font-mono transition-colors",
              selectedNodeId === node.id
                ? "border-primary/50 bg-primary/10"
                : "border-border/70 bg-card hover:bg-muted",
            )}
            style={{ paddingLeft: `${8 + node.depth * 14}px` }}
          >
            <div className="flex items-center gap-2">
              <span className="text-foreground">{markText(node.operator, query)}</span>
              <span className="text-[10px] text-muted-foreground">{node.costPercent.toFixed(1)}%</span>
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{markText(node.detail || node.text, query)}</div>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {nodes.map((node) => (
        <button
          key={node.id}
          onClick={() => onSelectNode(node.id)}
          className={cn(
            "w-full text-left rounded border p-2 transition-colors",
            operatorAccent(node.operator, node.isAnnotation),
            selectedNodeId === node.id && "ring-1 ring-primary/50",
          )}
          style={{ marginLeft: `${node.depth * 18}px`, width: `calc(100% - ${node.depth * 18}px)` }}
        >
          <div className="flex items-start gap-2 justify-between">
            <div>
              <div className="text-xs font-semibold text-foreground">{markText(node.operator, query)}</div>
              <div className="text-[11px] text-foreground/80 mt-0.5 break-all">
                {markText(node.detail || node.text, query)}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-[10px] text-muted-foreground">Estimated Cost</div>
              <div className="text-xs text-foreground font-semibold">{node.costPercent.toFixed(1)}%</div>
            </div>
          </div>

          <div className="mt-1.5 h-1.5 rounded bg-muted overflow-hidden">
            <div
              className="h-full bg-primary rounded"
              style={{ width: `${Math.max(3, Math.min(100, node.costPercent))}%` }}
            />
          </div>
        </button>
      ))}
    </div>
  );
}
