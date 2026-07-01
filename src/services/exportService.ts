import { invokeCommand } from "./tauriService";

export type ExportFormat = "csv" | "json" | "parquet";

/**
 * Export query results to a file.
 * @returns number of rows exported
 */
export function exportQueryResults(
  sql: string,
  destPath: string,
  format: ExportFormat,
  connectionId?: string | null,
): Promise<number> {
  return invokeCommand<number>("export_query_results", {
    sql,
    destPath,
    format,
    connectionId: connectionId ?? null,
  });
}
