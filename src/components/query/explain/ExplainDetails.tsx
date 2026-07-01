import { cn } from "../../../utils/formatters";
import { ExplainNode, PlanFlavor } from "./types";

interface ExplainDetailsProps {
  flavor: PlanFlavor;
  node: ExplainNode | null;
}

export function ExplainDetails({ flavor, node }: ExplainDetailsProps) {
  return (
    <div className="min-h-0 overflow-auto p-3 bg-card">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Operator Details</div>
      {node ? (
        <div className="space-y-2 text-xs">
          <div>
            <div className="text-muted-foreground">Operator</div>
            <div className="text-foreground font-semibold">{node.operator}</div>
          </div>

          {flavor === "postgres" && node.startupCost !== null ? (
            <div>
              <div className="text-muted-foreground">Cost (startup to total)</div>
              <div className="text-foreground font-mono">
                {node.startupCost.toFixed(2)} to {node.totalCost?.toFixed(2)}
              </div>
            </div>
          ) : (
            <div>
              <div className="text-muted-foreground">Relative Cost</div>
              <div className="text-foreground">{node.costPercent.toFixed(2)}%</div>
            </div>
          )}

          <div>
            <div className="text-muted-foreground">Depth</div>
            <div className="text-foreground">Level {node.depth + 1}</div>
          </div>

          <div>
            <div className="text-muted-foreground">
              {node.actualRows !== null ? "Rows (estimated to actual)" : "Estimated Rows"}
            </div>
            <div
              className={cn(
                "text-foreground font-mono",
                node.actualRows !== null &&
                  node.estimatedRows !== null &&
                  Math.abs((node.actualRows - node.estimatedRows) / (node.estimatedRows + 1)) > 0.5 &&
                  "text-destructive",
              )}
            >
              {node.estimatedRows?.toLocaleString() ?? "N/A"}
              {node.actualRows !== null && ` to ${node.actualRows.toLocaleString()}`}
            </div>
          </div>

          {node.actualTime !== null && (
            <div>
              <div className="text-muted-foreground">Actual Time</div>
              <div className="text-foreground font-mono">{node.actualTime.toFixed(3)} ms</div>
            </div>
          )}

          {node.loops !== null && (
            <div>
              <div className="text-muted-foreground">Loops</div>
              <div className="text-foreground">{node.loops}</div>
            </div>
          )}

          <div>
            <div className="text-muted-foreground">Detail</div>
            <pre className="mt-1 text-[11px] font-mono text-foreground/80 whitespace-pre-wrap bg-card border border-border/70 rounded p-2">
              {node.detail || node.text}
            </pre>
          </div>
          <div>
            <div className="text-muted-foreground">Raw Plan Line</div>
            <pre className="mt-1 text-[11px] font-mono text-foreground/80 whitespace-pre-wrap bg-card border border-border/70 rounded p-2">
              {node.text}
            </pre>
          </div>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">No operator selected.</div>
      )}
    </div>
  );
}
