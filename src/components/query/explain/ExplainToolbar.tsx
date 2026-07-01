import { Copy, FileSearch, Filter, RefreshCw, Search, TreePine, Workflow, WrapText } from "lucide-react";
import { cn } from "../../../utils/formatters";
import { ExplainViewMode, PlanFlavor } from "./types";

interface ExplainToolbarProps {
  flavor: PlanFlavor;
  isExplaining: boolean;
  query: string;
  viewMode: ExplainViewMode;
  wrap: boolean;
  showOnlyExpensive: boolean;
  onQueryChange: (value: string) => void;
  onViewModeChange: (mode: ExplainViewMode) => void;
  onWrapToggle: () => void;
  onHotOpsToggle: () => void;
  onRefresh: () => void;
  onAnalyze: () => void;
  onCopy: () => void | Promise<void>;
}

export function ExplainToolbar({
  flavor,
  isExplaining,
  query,
  viewMode,
  wrap,
  showOnlyExpensive,
  onQueryChange,
  onViewModeChange,
  onWrapToggle,
  onHotOpsToggle,
  onRefresh,
  onAnalyze,
  onCopy,
}: ExplainToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 bg-muted border border-border rounded px-2 py-1">
        <Search size={12} className="text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search operators..."
          aria-label="Search plan operators"
          className="bg-transparent text-xs text-foreground/80 placeholder:text-muted-foreground outline-none w-44"
        />
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onViewModeChange("plan")}
          className={cn("btn text-xs", viewMode === "plan" ? "bg-primary/20 text-primary" : "btn-ghost")}
        >
          <Workflow size={12} /> Plan
        </button>
        <button
          onClick={() => onViewModeChange("tree")}
          className={cn("btn text-xs", viewMode === "tree" ? "bg-primary/20 text-primary" : "btn-ghost")}
        >
          <TreePine size={12} /> Tree
        </button>
        <button
          onClick={() => onViewModeChange("text")}
          className={cn("btn text-xs", viewMode === "text" ? "bg-primary/20 text-primary" : "btn-ghost")}
        >
          Text
        </button>
      </div>

      <button onClick={onWrapToggle} className="btn-ghost text-xs flex items-center gap-1">
        <WrapText size={12} /> {wrap ? "Wrap On" : "Wrap Off"}
      </button>

      <button
        onClick={onHotOpsToggle}
        className={cn("btn text-xs flex items-center gap-1", showOnlyExpensive ? "bg-destructive/20 text-destructive" : "btn-ghost")}
        title="Show operators with estimated cost >= 8%"
      >
        <Filter size={12} /> Hot Ops
      </button>

      <button onClick={onRefresh} disabled={isExplaining} className="btn-ghost text-xs flex items-center gap-1">
        <RefreshCw size={12} className={cn(isExplaining && "animate-spin")} /> Refresh
      </button>

      <button
        onClick={onAnalyze}
        disabled={isExplaining}
        className="btn-ghost text-xs flex items-center gap-1"
        title={flavor === "postgres" ? "Run EXPLAIN ANALYZE (includes actual timing)" : "Run EXPLAIN VERBOSE"}
      >
        <FileSearch size={12} /> {flavor === "postgres" ? "Analyze" : "Verbose"}
      </button>

      <button onClick={() => void onCopy()} className="btn-ghost text-xs flex items-center gap-1 ml-auto">
        <Copy size={12} /> Copy
      </button>
    </div>
  );
}
