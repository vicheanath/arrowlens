import { useMemo, useState } from "react";
import { ExplainContent } from "./explain/ExplainContent";
import { ExplainDetails } from "./explain/ExplainDetails";
import { ExplainStats } from "./explain/ExplainStats";
import { ExplainToolbar } from "./explain/ExplainToolbar";
import { detectPlanFlavor, extractPgTimings, parseExplainPlan } from "./explain/planParsers";
import { ExplainPanelProps, ExplainViewMode } from "./explain/types";

export function ExplainPanel({ explainPlan, isExplaining, onRerun }: ExplainPanelProps) {
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<ExplainViewMode>("plan");
  const [wrap, setWrap] = useState(true);
  const [showOnlyExpensive, setShowOnlyExpensive] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const flavor = useMemo(() => detectPlanFlavor(explainPlan), [explainPlan]);
  const pgTimings = useMemo(
    () => (flavor === "postgres" ? extractPgTimings(explainPlan) : null),
    [flavor, explainPlan],
  );
  const nodes = useMemo(() => parseExplainPlan(explainPlan), [explainPlan]);

  const filteredNodes = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return nodes.filter((node) => {
      const textMatch = !needle || node.text.toLowerCase().includes(needle);
      const expensiveMatch = !showOnlyExpensive || node.costPercent >= 8;
      // In PG mode, exclude pure annotation lines from the hot ops filter
      if (showOnlyExpensive && flavor === "postgres" && node.isAnnotation) return false;
      return textMatch && expensiveMatch;
    });
  }, [nodes, query, showOnlyExpensive, flavor]);

  const operatorStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const node of nodes) {
      counts.set(node.operator, (counts.get(node.operator) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [nodes]);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? filteredNodes[0] ?? null,
    [filteredNodes, nodes, selectedNodeId],
  );

  const expensiveCount = useMemo(
    () => nodes.filter((node) => node.costPercent >= 8).length,
    [nodes],
  );

  const maxDepth = useMemo(() => nodes.reduce((max, node) => Math.max(max, node.depth), 0), [nodes]);

  const onCopy = async () => {
    await navigator.clipboard.writeText(explainPlan);
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex-shrink-0 border-b border-border/70 px-3 py-2 bg-surface-2">
        <ExplainToolbar
          flavor={flavor}
          isExplaining={isExplaining}
          query={query}
          viewMode={viewMode}
          wrap={wrap}
          showOnlyExpensive={showOnlyExpensive}
          onQueryChange={setQuery}
          onViewModeChange={setViewMode}
          onWrapToggle={() => setWrap((value) => !value)}
          onHotOpsToggle={() => setShowOnlyExpensive((value) => !value)}
          onRefresh={() => onRerun(false)}
          onAnalyze={() => onRerun(true)}
          onCopy={onCopy}
        />

        <ExplainStats
          filteredCount={filteredNodes.length}
          totalCount={nodes.length}
          maxDepth={maxDepth}
          expensiveCount={expensiveCount}
          pgTimings={pgTimings}
          operatorStats={operatorStats}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="h-full grid grid-cols-[1fr_320px]">
          <div className="min-h-0 overflow-auto p-3 border-r border-border/60">
            <ExplainContent
              explainPlan={explainPlan}
              query={query}
              viewMode={viewMode}
              wrap={wrap}
              nodes={filteredNodes}
              selectedNodeId={selectedNode?.id ?? null}
              onSelectNode={setSelectedNodeId}
            />
          </div>

          <ExplainDetails flavor={flavor} node={selectedNode} />
        </div>
      </div>
    </div>
  );
}
