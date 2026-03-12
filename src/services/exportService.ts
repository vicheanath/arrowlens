import { invokeCommand } from "./tauriService";

export type ExportFormat = "csv" | "json" | "parquet";

/**
 * Export query results to a file.
 * @returns number of rows exported
 */
export function exportQueryResults(
  sql: string,
  destPath: string,
  format: ExportFormat
): Promise<number> {
  return invokeCommand<number>("export_query_results", {
    sql,
    destPath,
    format,
  });
}
