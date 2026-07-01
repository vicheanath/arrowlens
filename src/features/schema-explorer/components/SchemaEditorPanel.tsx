import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Lock, Play, RefreshCw } from "lucide-react";
import { getDialectLabel } from "../../../utils/sql";
import { useToast } from "../../../utils/toast";
import { runQuery } from "../../../services/queryService";
import { errorToMessage } from "../../../utils/errors";
import { useSchemaInspector } from "../useSchemaInspector";
import { useSchemaEdit } from "../../../state/uiStore";
import { tableIdentity } from "../schemaModel";
import { buildAlterSql, commonColumnTypes, type AlterOperation } from "../schemaDdl";
import type { InspectedTable } from "../../../models/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Callout } from "@/components/ui/callout";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type OperationKind = AlterOperation["kind"];

const OPERATIONS: { kind: OperationKind; label: string; destructive?: boolean }[] = [
  { kind: "add_column", label: "Add column" },
  { kind: "rename_column", label: "Rename column" },
  { kind: "drop_column", label: "Drop column", destructive: true },
  { kind: "rename_table", label: "Rename table", destructive: true },
];

const OPERATION_LABEL: Record<OperationKind, string> = Object.fromEntries(
  OPERATIONS.map((o) => [o.kind, o.label]),
) as Record<OperationKind, string>;

export function SchemaEditorPanel() {
  const inspector = useSchemaInspector();
  const { tables, dialect, connectionId, isEditable, sourceKind, status } = inspector;
  const { schemaEditTarget } = useSchemaEdit();
  const toast = useToast();

  const [tableId, setTableId] = useState<string>("");
  const [operation, setOperation] = useState<OperationKind>("add_column");
  const [columnName, setColumnName] = useState("");
  const [dataType, setDataType] = useState("");
  const [notNull, setNotNull] = useState(false);
  const [defaultExpr, setDefaultExpr] = useState("");
  const [renameColumn, setRenameColumn] = useState("");
  const [newName, setNewName] = useState("");
  const [dropColumn, setDropColumn] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  // Errors are only surfaced once the user attempts to run, so a pristine form
  // isn't littered with "required" messages.
  const [attempted, setAttempted] = useState(false);

  const selectedTable = useMemo<InspectedTable | null>(
    () => tables.find((t) => tableIdentity(t) === tableId) ?? tables[0] ?? null,
    [tables, tableId],
  );

  // Keep the selected table valid as the schema loads or changes.
  useEffect(() => {
    if (tables.length > 0 && !tables.some((t) => tableIdentity(t) === tableId)) {
      setTableId(tableIdentity(tables[0]));
    }
  }, [tables, tableId]);

  // Deep-link: when another surface (e.g. the schema browser) asks to edit a
  // specific table/column, preselect it and the requested operation.
  useEffect(() => {
    if (!schemaEditTarget) return;
    setTableId(schemaEditTarget.tableId);
    if (schemaEditTarget.operation) setOperation(schemaEditTarget.operation);
    if (schemaEditTarget.column) {
      if (schemaEditTarget.operation === "rename_column") setRenameColumn(schemaEditTarget.column);
      if (schemaEditTarget.operation === "drop_column") setDropColumn(schemaEditTarget.column);
    }
    setConfirming(false);
    setAttempted(false);
    // Only re-run when a new request arrives (nonce changes), not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemaEditTarget?.nonce]);

  // Any edit invalidates a pending confirmation.
  const resetConfirm = () => setConfirming(false);

  const columns = selectedTable?.columns ?? [];

  const op: AlterOperation | null = useMemo(() => {
    if (!selectedTable) return null;
    const table = selectedTable.qualified_name || selectedTable.name;
    switch (operation) {
      case "add_column":
        return { kind: "add_column", table, column: columnName, dataType, notNull, defaultExpr };
      case "rename_column":
        return { kind: "rename_column", table, column: renameColumn, newName };
      case "drop_column":
        return { kind: "drop_column", table, column: dropColumn };
      case "rename_table":
        return { kind: "rename_table", table, newName };
    }
  }, [selectedTable, operation, columnName, dataType, notNull, defaultExpr, renameColumn, newName, dropColumn]);

  const sql = useMemo(() => (op ? buildAlterSql(op, dialect) : null), [op, dialect]);
  const isDestructive = operation === "drop_column" || operation === "rename_table";

  // Field-level validation. Returns a map of field → message; empty when valid.
  const errors = useMemo(() => {
    const existing = new Set(columns.map((c) => c.name.toLowerCase()));
    const e: Partial<Record<"columnName" | "dataType" | "renameColumn" | "dropColumn" | "newName", string>> = {};
    const name = newName.trim().toLowerCase();
    switch (operation) {
      case "add_column":
        if (!columnName.trim()) e.columnName = "Column name is required.";
        else if (existing.has(columnName.trim().toLowerCase())) e.columnName = "A column with this name already exists.";
        if (!dataType.trim()) e.dataType = "Type is required.";
        break;
      case "rename_column":
        if (!renameColumn) e.renameColumn = "Select a column to rename.";
        if (!newName.trim()) e.newName = "New name is required.";
        else if (name !== renameColumn.toLowerCase() && existing.has(name)) e.newName = "A column with this name already exists.";
        break;
      case "drop_column":
        if (!dropColumn) e.dropColumn = "Select a column to drop.";
        break;
      case "rename_table":
        if (!newName.trim()) e.newName = "New table name is required.";
        break;
    }
    return e;
  }, [operation, columnName, dataType, renameColumn, dropColumn, newName, columns]);

  const err = (key: keyof typeof errors) => (attempted ? errors[key] : undefined);

  const changeOperation = (next: OperationKind) => {
    setOperation(next);
    setConfirming(false);
    setAttempted(false);
  };

  if (!isEditable) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <Lock size={26} className="text-muted-foreground opacity-40" />
        <p className="text-sm text-muted-foreground">
          {sourceKind === "dataset"
            ? "Datasets are read-only files and can't be altered."
            : "Select a database connection to edit its schema."}
        </p>
        {sourceKind === "dataset" && (
          <p className="max-w-sm text-xs text-muted-foreground opacity-70">
            Connect a SQLite, Postgres, or MySQL database to add, rename, or drop columns.
          </p>
        )}
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <RefreshCw size={14} className="animate-spin" /> Loading schema…
      </div>
    );
  }

  if (tables.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No tables available to edit.
      </div>
    );
  }

  async function run() {
    if (Object.keys(errors).length > 0) {
      setAttempted(true);
      return;
    }
    if (!sql || !connectionId) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setRunning(true);
    try {
      await runQuery(sql, connectionId);
      toast.success(sql, "Schema updated");
      // Reset inputs and pull the fresh schema.
      setColumnName("");
      setDataType("");
      setDefaultExpr("");
      setNotNull(false);
      setRenameColumn("");
      setNewName("");
      setDropColumn("");
      setConfirming(false);
      setAttempted(false);
      inspector.refetch();
    } catch (err) {
      toast.error(errorToMessage(err), "ALTER failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto">
      <div className="flex flex-col gap-4 p-4">
        {/* Table + operation pickers */}
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Table
            </FieldLabel>
            <Select
              value={tableId}
              onValueChange={(value) => {
                setTableId(value as string);
                resetConfirm();
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {() => (selectedTable ? selectedTable.qualified_name || selectedTable.name : "Select table")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {tables.map((t) => (
                  <SelectItem key={tableIdentity(t)} value={tableIdentity(t)}>
                    {t.qualified_name || t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Operation
            </FieldLabel>
            <Select value={operation} onValueChange={(value) => changeOperation(value as OperationKind)}>
              <SelectTrigger className="w-full">
                <SelectValue>{(value: OperationKind) => OPERATION_LABEL[value] ?? value}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {OPERATIONS.map((o) => (
                  <SelectItem key={o.kind} value={o.kind}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        {/* Operation-specific fields */}
        {operation === "add_column" && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Field data-invalid={!!err("columnName")}>
                <FieldLabel className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Column name
                </FieldLabel>
                <Input
                  value={columnName}
                  placeholder="e.g. created_at"
                  aria-invalid={!!err("columnName")}
                  onChange={(e) => {
                    setColumnName(e.target.value);
                    resetConfirm();
                  }}
                />
                <FieldError>{err("columnName")}</FieldError>
              </Field>
              <Field data-invalid={!!err("dataType")}>
                <FieldLabel className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Type
                </FieldLabel>
                <Input
                  list="schema-editor-types"
                  value={dataType}
                  placeholder={commonColumnTypes(dialect)[0]}
                  aria-invalid={!!err("dataType")}
                  onChange={(e) => {
                    setDataType(e.target.value);
                    resetConfirm();
                  }}
                />
                <datalist id="schema-editor-types">
                  {commonColumnTypes(dialect).map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
                <FieldError>{err("dataType")}</FieldError>
              </Field>
            </div>
            <div className="flex items-center gap-4">
              <Field orientation="horizontal" className="w-fit">
                <Checkbox
                  id="schema-editor-not-null"
                  checked={notNull}
                  onCheckedChange={(checked) => {
                    setNotNull(checked === true);
                    resetConfirm();
                  }}
                />
                <FieldLabel htmlFor="schema-editor-not-null" className="text-xs text-foreground/80">
                  NOT NULL
                </FieldLabel>
              </Field>
              <Field className="flex-1">
                <FieldLabel className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Default expression
                </FieldLabel>
                <Input
                  value={defaultExpr}
                  placeholder="e.g. 0, 'active', now() — strings need quotes"
                  onChange={(e) => {
                    setDefaultExpr(e.target.value);
                    resetConfirm();
                  }}
                />
              </Field>
            </div>
          </div>
        )}

        {operation === "rename_column" && (
          <div className="grid grid-cols-2 gap-3">
            <Field data-invalid={!!err("renameColumn")}>
              <FieldLabel className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Column
              </FieldLabel>
              <Select
                value={renameColumn}
                onValueChange={(value) => {
                  setRenameColumn(value as string);
                  resetConfirm();
                }}
              >
                <SelectTrigger className="w-full" aria-invalid={!!err("renameColumn")}>
                  <SelectValue>{(value: string) => value || "Select column…"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {columns.map((c) => (
                    <SelectItem key={c.name} value={c.name}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError>{err("renameColumn")}</FieldError>
            </Field>
            <Field data-invalid={!!err("newName")}>
              <FieldLabel className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                New name
              </FieldLabel>
              <Input
                value={newName}
                placeholder="new_column_name"
                aria-invalid={!!err("newName")}
                onChange={(e) => {
                  setNewName(e.target.value);
                  resetConfirm();
                }}
              />
              <FieldError>{err("newName")}</FieldError>
            </Field>
          </div>
        )}

        {operation === "drop_column" && (
          <Field data-invalid={!!err("dropColumn")}>
            <FieldLabel className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Column to drop
            </FieldLabel>
            <Select
              value={dropColumn}
              onValueChange={(value) => {
                setDropColumn(value as string);
                resetConfirm();
              }}
            >
              <SelectTrigger className="w-full" aria-invalid={!!err("dropColumn")}>
                <SelectValue>{(value: string) => value || "Select column…"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {columns.map((c) => (
                  <SelectItem key={c.name} value={c.name}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError>{err("dropColumn")}</FieldError>
          </Field>
        )}

        {operation === "rename_table" && (
          <Field data-invalid={!!err("newName")}>
            <FieldLabel className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              New table name
            </FieldLabel>
            <Input
              value={newName}
              placeholder="new_table_name"
              aria-invalid={!!err("newName")}
              onChange={(e) => {
                setNewName(e.target.value);
                resetConfirm();
              }}
            />
            <FieldError>{err("newName")}</FieldError>
          </Field>
        )}

        {/* SQL preview */}
        <div>
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Generated SQL
          </div>
          <pre className="overflow-x-auto rounded border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-foreground/85">
            {sql ?? <span className="text-muted-foreground">Fill in the fields to generate SQL…</span>}
          </pre>
        </div>

        {isDestructive && (
          <Callout variant="warning" icon={<AlertTriangle />}>
            This statement mutates the live database and may drop data. Run a backup first if you're
            unsure.
          </Callout>
        )}

        {/* Run */}
        <div className="flex items-center gap-2">
          <Button
            disabled={running}
            onClick={run}
            className={confirming ? "bg-warning text-warning-foreground hover:bg-warning/90" : undefined}
          >
            {running ? <RefreshCw className="animate-spin" /> : <Play />}
            {running ? "Running…" : confirming ? "Confirm & run" : "Run ALTER"}
          </Button>
          {confirming && !running && (
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          )}
          <span className="ml-auto text-[11px] text-muted-foreground">
            {getDialectLabel(dialect)} dialect
          </span>
        </div>
      </div>
    </div>
  );
}
