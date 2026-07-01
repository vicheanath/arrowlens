import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { KeyRound, Link2, Table as TableIcon } from "lucide-react";
import { TYPE_TAG_CLASS, getTypeCategory, shortTypeName } from "../../../utils/dataTypes";
import type { InspectedTable } from "../../../models/database";

export interface TableNodeData {
  table: InspectedTable;
  fkColumns: Set<string>;
  [key: string]: unknown;
}

export const TABLE_NODE_WIDTH = 240;
export const TABLE_HEADER_HEIGHT = 30;
export const TABLE_ROW_HEIGHT = 24;

/** Estimated rendered height — used to seed the dagre layout. */
export function tableNodeHeight(table: InspectedTable): number {
  return TABLE_HEADER_HEIGHT + table.columns.length * TABLE_ROW_HEIGHT;
}

function TableNodeComponent({ data }: NodeProps) {
  const { table, fkColumns } = data as TableNodeData;

  return (
    <div
      className="overflow-hidden rounded-md border border-border bg-card shadow-lg"
      style={{ width: TABLE_NODE_WIDTH }}
    >
      <div
        className="flex items-center gap-1.5 border-b border-border bg-accent-blue/15 px-2 font-mono text-xs font-semibold text-foreground"
        style={{ height: TABLE_HEADER_HEIGHT }}
      >
        <TableIcon size={12} className="flex-shrink-0 text-accent-blue" />
        <span className="truncate">{table.name}</span>
      </div>

      <div>
        {table.columns.map((column) => {
          const isPk = column.is_primary_key;
          const isFk = fkColumns.has(column.name);
          const cat = getTypeCategory(column.data_type);
          return (
            <div
              key={column.name}
              className="relative flex items-center gap-1.5 border-b border-border/40 px-2 text-[11px] last:border-b-0"
              style={{ height: TABLE_ROW_HEIGHT }}
            >
              {/* Per-column connection points for foreign-key edges. */}
              <Handle
                type="target"
                position={Position.Left}
                id={column.name}
                className="!h-1.5 !w-1.5 !border-0 !bg-accent-mauve/60"
                style={{ left: -3 }}
              />
              <Handle
                type="source"
                position={Position.Right}
                id={column.name}
                className="!h-1.5 !w-1.5 !border-0 !bg-accent-mauve/60"
                style={{ right: -3 }}
              />

              {isPk ? (
                <KeyRound size={10} className="flex-shrink-0 text-accent-yellow" />
              ) : isFk ? (
                <Link2 size={10} className="flex-shrink-0 text-accent-mauve" />
              ) : (
                <span className="w-2.5 flex-shrink-0" />
              )}
              <span className="flex-1 truncate font-mono text-foreground/85">{column.name}</span>
              <span className={`flex-shrink-0 !px-1 !py-0 text-[9px] ${TYPE_TAG_CLASS[cat]}`}>
                {shortTypeName(column.data_type)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const TableNode = memo(TableNodeComponent);
