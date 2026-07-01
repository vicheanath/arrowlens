import React from "react";
import { Copy, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InspectedForeignKey, InspectedTable } from "../../models/database";

/** Render an approximate CREATE TABLE statement from introspected metadata. */
export function renderTableDdl(table: InspectedTable, foreignKeys: InspectedForeignKey[]): string {
  const lines: string[] = [];
  for (const col of table.columns) {
    let line = `  ${col.name} ${col.data_type}`;
    if (col.is_primary_key) line += " PRIMARY KEY";
    if (!col.nullable) line += " NOT NULL";
    lines.push(line);
  }
  for (const fk of foreignKeys.filter((f) => f.from_table === table.name)) {
    lines.push(`  FOREIGN KEY (${fk.from_column}) REFERENCES ${fk.to_table} (${fk.to_column})`);
  }
  return `CREATE TABLE ${table.qualified_name} (\n${lines.join(",\n")}\n);`;
}

interface TableDdlDialogProps {
  table: InspectedTable;
  foreignKeys: InspectedForeignKey[];
  onClose: () => void;
}

export function TableDdlDialog({ table, foreignKeys, onClose }: TableDdlDialogProps) {
  const ddl = React.useMemo(() => renderTableDdl(table, foreignKeys), [table, foreignKeys]);
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ddl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">{table.qualified_name}</DialogTitle>
        </DialogHeader>
        <pre className="max-h-[60vh] overflow-auto whitespace-pre rounded-md border border-border bg-muted/40 p-3 font-mono text-xs text-foreground">
          {ddl}
        </pre>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            {table.columns.length} columns
            {table.row_estimate != null && table.row_estimate >= 0
              ? ` · ~${table.row_estimate.toLocaleString()} rows`
              : ""}
          </span>
          <Button variant="outline" size="sm" onClick={copy}>
            {copied ? <Check className="text-accent-green" /> : <Copy />}
            {copied ? "Copied" : "Copy DDL"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
