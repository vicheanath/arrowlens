import { ExplainNode, PgCosts, PgTimings, PlanFlavor } from "./types";

const OPERATOR_BASE_WEIGHT: Record<string, number> = {
  Join: 18,
  HashJoin: 20,
  NestedLoopJoin: 25,
  MergeJoin: 22,
  Aggregate: 14,
  HashAggregate: 15,
  Sort: 12,
  Repartition: 11,
  Union: 8,
  Filter: 6,
  Projection: 4,
  Limit: 2,
  Scan: 9,
  TableScan: 10,
  ParquetExec: 10,
  CsvExec: 9,
  JsonExec: 9,
  "Seq Scan": 9,
  "Index Scan": 7,
  "Index Only Scan": 6,
  "Bitmap Heap Scan": 10,
  "Bitmap Index Scan": 8,
  "Hash Join": 20,
  "Merge Join": 22,
  "Nested Loop": 25,
  Hash: 8,
  Materialize: 5,
  Unique: 6,
  "Subquery Scan": 7,
  WindowAgg: 12,
  Gather: 6,
  "Gather Merge": 7,
};

function toPrettyOperator(raw: string): string {
  return raw
    .replace(/Exec$/i, "")
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
}

export function detectPlanFlavor(plan: string): PlanFlavor {
  return /\(cost=[\d.]+\.\.[\d.]+/.test(plan) ? "postgres" : "datafusion";
}

export function extractPgTimings(plan: string): PgTimings {
  const planningMatch = plan.match(/^Planning(?:\s+Time)?:\s*([\d.]+ ms)/im);
  const execMatch = plan.match(/^Execution(?:\s+Time)?:\s*([\d.]+ ms)/im);
  return {
    planning: planningMatch?.[1] ?? null,
    execution: execMatch?.[1] ?? null,
  };
}

function parsePgCosts(text: string): PgCosts {
  const planMatch = text.match(/\(cost=([\d.]+)\.\.([\d.]+)\s+rows=(\d+)\s+width=(\d+)\)/);
  const actualMatch = text.match(/\(actual\s+time=[\d.]+\.\.([\d.]+)\s+rows=(\d+)\s+loops=(\d+)\)/);
  return {
    startupCost: planMatch ? Number(planMatch[1]) : null,
    totalCost: planMatch ? Number(planMatch[2]) : null,
    estimatedRows: planMatch ? Number(planMatch[3]) : null,
    width: planMatch ? Number(planMatch[4]) : null,
    actualEndTime: actualMatch ? Number(actualMatch[1]) : null,
    actualRows: actualMatch ? Number(actualMatch[2]) : null,
    loops: actualMatch ? Number(actualMatch[3]) : null,
  };
}

function pgLineDepth(line: string): number {
  const spaces = line.length - line.trimStart().length;
  const trimmed = line.trimStart();
  if (trimmed.startsWith("->")) {
    return Math.round((spaces - 2) / 6) + 1;
  }
  if (spaces === 0) return 0;
  return Math.max(0, Math.round((spaces - 2) / 6));
}

function detectPgOperator(trimmed: string): string {
  const withoutArrow = trimmed.replace(/^->\s+/, "");
  const opMatch = withoutArrow.match(/^(.+?)\s+\(cost=/);
  if (opMatch) {
    return opMatch[1].replace(/\s+on\s+.*$/i, "").trim();
  }
  const annotMatch = withoutArrow.match(/^([A-Za-z][A-Za-z ]{1,24}):/);
  if (annotMatch) return annotMatch[1].trim();
  return withoutArrow.slice(0, 30).trim() || "Operator";
}

function detectDataFusionOperator(line: string): string {
  const explicit = line.match(/^([A-Za-z0-9_]+?)(Exec)?\s*:/);
  if (explicit?.[1]) return toPrettyOperator(explicit[1]);
  const fallback = line.match(/^([A-Za-z0-9_ ]{3,40})\s+/);
  if (fallback?.[1]) return toPrettyOperator(fallback[1]);
  return "Operator";
}

function extractDetail(line: string): string {
  const split = line.split(":");
  if (split.length < 2) return line;
  return split.slice(1).join(":").trim();
}

function extractDataFusionRows(text: string): number | null {
  const patterns = [
    /rows\s*[=:]\s*([\d_.]+)/i,
    /row_count\s*[=:]\s*([\d_.]+)/i,
    /estimated_rows\s*[=:]\s*([\d_.]+)/i,
    /statistics\s*\{[^}]*rows\s*[:=]\s*([\d_.]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const value = Number(match[1].replace(/_/g, ""));
    if (Number.isFinite(value)) return value;
  }

  return null;
}

function dataFusionNodeWeight(operator: string, estimatedRows: number | null, depth: number): number {
  const compact = operator.replace(/\s+/g, "");
  const base = OPERATOR_BASE_WEIGHT[compact] ?? OPERATOR_BASE_WEIGHT[operator] ?? 5;
  const rowBoost = estimatedRows ? Math.min(12, Math.log10(estimatedRows + 1) * 3) : 0;
  const depthFactor = Math.max(0.5, 1 - depth * 0.06);
  return (base + rowBoost) * depthFactor;
}

function parsePostgresPlan(lines: string[]): ExplainNode[] {
  const parentAtDepth = new Map<number, string>();
  const draft: Omit<ExplainNode, "costPercent">[] = lines.map((line, index) => {
    const trimmed = line.trimStart();
    const depth = pgLineDepth(line);
    const id = `${index}-${trimmed.slice(0, 30)}`;
    const parentId = depth > 0 ? (parentAtDepth.get(depth - 1) ?? null) : null;

    parentAtDepth.set(depth, id);
    for (const key of [...parentAtDepth.keys()]) {
      if (key > depth) parentAtDepth.delete(key);
    }

    const costs = parsePgCosts(trimmed);
    const isAnnotation = costs.totalCost === null && !/\(cost=/.test(trimmed) && !/^(Planning|Execution)\s+(Time)?:/i.test(trimmed);
    const operator = detectPgOperator(trimmed);
    const detail = trimmed
      .replace(/^->\s+/, "")
      .replace(/\(cost=[^)]+\)/g, "")
      .replace(/\(actual[^)]+\)/g, "")
      .trim();

    return {
      id,
      text: trimmed,
      depth,
      operator,
      detail,
      parentId,
      estimatedRows: costs.estimatedRows,
      actualRows: costs.actualRows,
      startupCost: costs.startupCost,
      totalCost: costs.totalCost,
      actualTime: costs.actualEndTime,
      loops: costs.loops,
      isAnnotation,
      costWeight: costs.totalCost ?? 0,
    };
  });

  const maxCost = Math.max(...draft.map((node) => node.costWeight), 1);
  return draft.map((node) => ({
    ...node,
    costPercent: (node.costWeight / maxCost) * 100,
  }));
}

function parseDataFusionPlan(lines: string[]): ExplainNode[] {
  const parentAtDepth = new Map<number, string>();
  const draft: Omit<ExplainNode, "costPercent">[] = lines.map((line, index) => {
    const trimmed = line.trim();
    const indent = line.length - line.trimStart().length;
    const depth = Math.max(0, Math.floor(indent / 2));
    const id = `${index}-${trimmed.slice(0, 30)}`;
    const parentId = depth > 0 ? (parentAtDepth.get(depth - 1) ?? null) : null;

    parentAtDepth.set(depth, id);
    for (const key of [...parentAtDepth.keys()]) {
      if (key > depth) parentAtDepth.delete(key);
    }

    const operator = detectDataFusionOperator(trimmed);
    const detail = extractDetail(trimmed);
    const estimatedRows = extractDataFusionRows(trimmed);

    return {
      id,
      text: trimmed,
      depth,
      operator,
      detail,
      parentId,
      estimatedRows,
      actualRows: null,
      startupCost: null,
      totalCost: null,
      actualTime: null,
      loops: null,
      isAnnotation: false,
      costWeight: dataFusionNodeWeight(operator, estimatedRows, depth),
    };
  });

  const total = draft.reduce((sum, node) => sum + node.costWeight, 0) || 1;
  return draft.map((node) => ({
    ...node,
    costPercent: (node.costWeight / total) * 100,
  }));
}

export function parseExplainPlan(plan: string): ExplainNode[] {
  const flavor = detectPlanFlavor(plan);
  const lines = plan
    .split(/\r?\n/)
    .map((line) => line.replace(/\t/g, "  "))
    .filter((line) => line.trim().length > 0);

  return flavor === "postgres" ? parsePostgresPlan(lines) : parseDataFusionPlan(lines);
}
