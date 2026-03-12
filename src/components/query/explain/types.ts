export type ExplainViewMode = "plan" | "tree" | "text";
export type PlanFlavor = "datafusion" | "postgres";

export interface ExplainPanelProps {
  explainPlan: string;
  isExplaining: boolean;
  onRerun: (verbose: boolean) => void;
}

export interface PgTimings {
  planning: string | null;
  execution: string | null;
}

export interface PgCosts {
  startupCost: number | null;
  totalCost: number | null;
  estimatedRows: number | null;
  width: number | null;
  actualEndTime: number | null;
  actualRows: number | null;
  loops: number | null;
}

export interface ExplainNode {
  id: string;
  text: string;
  depth: number;
  operator: string;
  detail: string;
  parentId: string | null;
  estimatedRows: number | null;
  actualRows: number | null;
  startupCost: number | null;
  totalCost: number | null;
  actualTime: number | null;
  loops: number | null;
  isAnnotation: boolean;
  costWeight: number;
  costPercent: number;
}
