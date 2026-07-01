import { useEffect, useMemo } from "react";
import {
  Background,
  Controls,
  type Edge,
  MarkerType,
  MiniMap,
  type Node,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import "@xyflow/react/dist/style.css";
import { Network, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSchemaInspector } from "../useSchemaInspector";
import { matchesTable, resolveForeignKey, tableIdentity } from "../schemaModel";
import {
  TABLE_NODE_WIDTH,
  TableNode,
  type TableNodeData,
  tableNodeHeight,
} from "./TableNode";
import type { InspectedForeignKey, InspectedTable } from "../../../models/database";

const nodeTypes = { table: TableNode };

interface Layout {
  nodes: Node[];
  edges: Edge[];
}

/** Build positioned React Flow nodes/edges from the schema using a dagre layout. */
function buildLayout(
  tables: InspectedTable[],
  foreignKeys: InspectedForeignKey[],
): Layout {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: "LR", nodesep: 40, ranksep: 90, marginx: 24, marginy: 24 });

  for (const table of tables) {
    graph.setNode(tableIdentity(table), {
      width: TABLE_NODE_WIDTH,
      height: tableNodeHeight(table),
    });
  }

  const edges: Edge[] = [];
  foreignKeys.forEach((fk, index) => {
    const resolved = resolveForeignKey(fk, tables);
    if (!resolved) return;
    graph.setEdge(resolved.source, resolved.target);
    edges.push({
      id: `fk-${index}-${resolved.source}-${resolved.target}`,
      source: resolved.source,
      target: resolved.target,
      sourceHandle: fk.from_column,
      targetHandle: fk.to_column,
      type: "default",
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      style: { stroke: "var(--color-accent-mauve, #cba6f7)", strokeWidth: 1.5 },
    });
  });

  dagre.layout(graph);

  const nodes: Node[] = tables.map((table) => {
    const id = tableIdentity(table);
    const pos = graph.node(id);
    const height = tableNodeHeight(table);
    const fkColumns = new Set(
      foreignKeys
        .filter((fk) => matchesTable(table, fk.from_table))
        .map((fk) => fk.from_column),
    );
    return {
      id,
      type: "table",
      position: { x: (pos?.x ?? 0) - TABLE_NODE_WIDTH / 2, y: (pos?.y ?? 0) - height / 2 },
      data: { table, fkColumns } satisfies TableNodeData,
      draggable: true,
    };
  });

  return { nodes, edges };
}

function ERDiagramInner() {
  const { status, tables, foreignKeys, error, sourceKind, refetch } = useSchemaInspector();

  const layout = useMemo(() => buildLayout(tables, foreignKeys), [tables, foreignKeys]);
  const [nodes, setNodes, onNodesChange] = useNodesState(layout.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layout.edges);

  // Re-seed positions whenever the underlying schema changes.
  useEffect(() => {
    setNodes(layout.nodes);
    setEdges(layout.edges);
  }, [layout, setNodes, setEdges]);

  if (sourceKind === null) {
    return <DiagramMessage label="Select a connection or dataset to view its diagram." />;
  }
  if (status === "loading") {
    return <DiagramMessage label="Loading schema…" spin />;
  }
  if (status === "error") {
    return <DiagramMessage label={error ?? "Failed to load schema."} tone="error" onRetry={refetch} />;
  }
  if (tables.length === 0) {
    return <DiagramMessage label="No tables to diagram." />;
  }

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.15}
        proOptions={{ hideAttribution: true }}
        className="bg-background"
      >
        <Background color="var(--color-border, #313149)" gap={18} />
        <Controls className="!border-border !bg-card" showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor="var(--color-accent-blue, #89b4fa)"
          maskColor="rgba(0,0,0,0.4)"
          className="!border !border-border !bg-card"
        />
      </ReactFlow>
      {foreignKeys.length === 0 && (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded border border-border bg-card/90 px-3 py-1 text-[11px] text-muted-foreground">
          No foreign-key relationships in this source.
        </div>
      )}
    </div>
  );
}

export function ERDiagramPanel() {
  return (
    <ReactFlowProvider>
      <ERDiagramInner />
    </ReactFlowProvider>
  );
}

function DiagramMessage({
  label,
  spin,
  tone = "muted",
  onRetry,
}: {
  label: string;
  spin?: boolean;
  tone?: "muted" | "error";
  onRetry?: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <Network
        size={26}
        className={tone === "error" ? "text-destructive opacity-60" : "text-muted-foreground opacity-40"}
      />
      <p className={`text-sm ${tone === "error" ? "text-destructive" : "text-muted-foreground"}`}>
        {label}
      </p>
      {spin && <RefreshCw size={14} className="animate-spin text-muted-foreground" />}
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
