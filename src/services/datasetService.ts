import { invokeCommand } from "./tauriService";
import { DatasetInfo, LoaderPreview } from "../models/dataset";

export function loadDataset(path: string, name?: string): Promise<DatasetInfo> {
  return invokeCommand<DatasetInfo>("load_dataset", { path, name: name ?? null });
}

export function listDatasets(): Promise<DatasetInfo[]> {
  return invokeCommand<DatasetInfo[]>("list_datasets");
}

export function removeDataset(id: string): Promise<boolean> {
  return invokeCommand<boolean>("remove_dataset", { id });
}

export function getDatasetPreview(
  id: string,
  limit?: number
): Promise<LoaderPreview> {
  return invokeCommand<LoaderPreview>("get_dataset_preview", {
    id,
    limit: limit ?? null,
  });
}
