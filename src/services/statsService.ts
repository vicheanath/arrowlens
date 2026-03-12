import { invokeCommand } from "./tauriService";
import { DatasetSchema } from "../models/dataset";
import { ColumnStats, DatasetStats } from "../models/statistics";

export function getSchema(id: string): Promise<DatasetSchema> {
  return invokeCommand<DatasetSchema>("get_schema", { id });
}

export function getStatistics(id: string): Promise<DatasetStats> {
  return invokeCommand<DatasetStats>("get_statistics", { id });
}

export function getColumnStats(
  datasetId: string,
  columnName: string
): Promise<ColumnStats> {
  return invokeCommand<ColumnStats>("get_column_stats", {
    datasetId,
    columnName,
  });
}
