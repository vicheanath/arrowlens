import { invokeCommand } from "./tauriService";

export type SqlTemplateKind = "workspace_default" | "select_all" | "select_column" | "count";

interface BuildSqlTemplateParams {
  templateKind: SqlTemplateKind;
  connectionId?: string | null;
  tableName?: string | null;
  columnName?: string | null;
  limit?: number;
}

export function buildSqlTemplate(params: BuildSqlTemplateParams): Promise<string> {
  return invokeCommand<string>("build_sql_template", {
    templateKind: params.templateKind,
    connectionId: params.connectionId ?? null,
    tableName: params.tableName ?? null,
    columnName: params.columnName ?? null,
    limit: params.limit ?? null,
  });
}

export function buildWorkspaceDefaultSql(connectionId?: string | null): Promise<string> {
  return buildSqlTemplate({ templateKind: "workspace_default", connectionId });
}

export function buildSelectAllSql(
  tableName: string,
  connectionId?: string | null,
  limit = 100,
): Promise<string> {
  return buildSqlTemplate({
    templateKind: "select_all",
    connectionId,
    tableName,
    limit,
  });
}

export function buildSelectColumnSql(
  tableName: string,
  columnName: string,
  connectionId?: string | null,
  limit = 100,
): Promise<string> {
  return buildSqlTemplate({
    templateKind: "select_column",
    connectionId,
    tableName,
    columnName,
    limit,
  });
}

export function buildCountSql(
  tableName = "table_name",
  connectionId?: string | null,
): Promise<string> {
  return buildSqlTemplate({
    templateKind: "count",
    connectionId,
    tableName,
  });
}