import type { InspectedForeignKey, InspectedTable } from "../../models/database";

/** Stable per-table id used for React keys and diagram nodes. */
export function tableIdentity(table: InspectedTable): string {
  return table.qualified_name || table.name;
}

/**
 * Whether a foreign-key endpoint reference (which may be a bare or
 * schema-qualified name) points at the given table. Introspection across
 * engines is inconsistent about qualification, so we accept any spelling.
 */
export function matchesTable(table: InspectedTable, ref: string): boolean {
  const candidates = new Set(
    [
      table.qualified_name,
      table.name,
      table.schema ? `${table.schema}.${table.name}` : "",
    ].filter(Boolean),
  );
  return candidates.has(ref) || candidates.has(stripSchema(ref));
}

/** Drop a leading `schema.` qualifier from a table reference. */
export function stripSchema(ref: string): string {
  const parts = ref.split(".");
  return parts[parts.length - 1] ?? ref;
}

/** The outgoing foreign key for a specific column, if any. */
export function foreignKeyForColumn(
  table: InspectedTable,
  columnName: string,
  foreignKeys: InspectedForeignKey[],
): InspectedForeignKey | null {
  return (
    foreignKeys.find(
      (fk) => fk.from_column === columnName && matchesTable(table, fk.from_table),
    ) ?? null
  );
}

/** Resolve a foreign key's endpoints to table identities present in the schema. */
export function resolveForeignKey(
  fk: InspectedForeignKey,
  tables: InspectedTable[],
): { source: string; target: string } | null {
  const source = tables.find((t) => matchesTable(t, fk.from_table));
  const target = tables.find((t) => matchesTable(t, fk.to_table));
  if (!source || !target) return null;
  return { source: tableIdentity(source), target: tableIdentity(target) };
}
