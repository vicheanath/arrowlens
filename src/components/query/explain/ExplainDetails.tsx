import { cn } from "../../../utils/formatters";
import { ExplainNode, PlanFlavor } from "./types";

interface ExplainDetailsProps {
  flavor: PlanFlavor;
  node: ExplainNode | null;
}

export function ExplainDetails({ flavor, node }: ExplainDetailsProps) {
  return (
    <div className="min-h-0 overflow-auto p-3 bg-surface-2">
      <div className="text-xs uppercase tracking-wide text-text-muted mb-2">Operator Details</div>
      {node ? (
        <div className="space-y-2 text-xs">
          <div>
            <div className="text-text-muted">Operator</div>
            <div className="text-text-primary font-semibold">{node.operator}</div>
          </div>

          {flavor === "postgres" && node.startupCost !== null ? (
            <div>
              <div className="text-text-muted">Cost (startup to total)</div>
              <div className="text-text-primary font-mono">
                {node.startupCost.toFixed(2)} to {node.totalCost?.toFixed(2)}
              </div>
            </div>
          ) : (
            <div>
              <div className="text-text-muted">Relative Cost</div>
              <div className="text-text-primary">{node.costPercent.toFixed(2)}%</div>
            </div>
          )}

          <div>
            <div className="text-text-muted">Depth</div>
            <div className="text-text-primary">Level {node.depth + 1}</div>
          </div>

          <div>
            <div className="text-text-muted">
              {node.actualRows !== null ? "Rows (estimated to actual)" : "Estimated Rows"}
            </div>
            <div
              className={cn(
                "text-text-primary font-mono",
                node.actualRows !== null &&
                  node.estimatedRows !== null &&
                  Math.abs((node.actualRows - node.estimatedRows) / (node.estimatedRows + 1)) > 0.5 &&
                  "text-accent-red",
              )}
            >
              {node.estimatedRows?.toLocaleString() ?? "N/A"}
              {node.actualRows !== null && ` to ${node.actualRows.toLocaleString()}`}
            </div>
          </div>

          {node.actualTime !== null && (
            <div>
              <div className="text-text-muted">Actual Time</div>
              <div className="text-text-primary font-mono">{node.actualTime.toFixed(3)} ms</div>
            </div>
          )}

          {node.loops !== null && (
            <div>
              <div className="text-text-muted">Loops</div>
              <div className="text-text-primary">{node.loops}</div>
            </div>
          )}

          <div>
            <div className="text-text-muted">Detail</div>
            <pre className="mt-1 text-[11px] font-mono text-text-secondary whitespace-pre-wrap bg-surface-1 border border-border/70 rounded p-2">
              {node.detail || node.text}
            </pre>
          </div>
          <div>
            <div className="text-text-muted">Raw Plan Line</div>
            <pre className="mt-1 text-[11px] font-mono text-text-secondary whitespace-pre-wrap bg-surface-1 border border-border/70 rounded p-2">
              {node.text}
            </pre>
          </div>
        </div>
      ) : (
        <div className="text-xs text-text-muted">No operator selected.</div>
      )}
    </div>
  );
}
