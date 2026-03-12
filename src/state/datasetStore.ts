import React, { createContext, useContext, useMemo, useState } from "react";
import { DatasetInfo, DatasetSchema, LoaderPreview } from "../models/dataset";
import { DatasetStats } from "../models/statistics";
import * as datasetService from "../services/datasetService";
import * as statsService from "../services/statsService";
import { useToast } from "../utils/toast";
import { errorToMessage } from "../utils/errors";

interface DatasetState {
  datasets: DatasetInfo[];
  selectedId: string | null;
  preview: LoaderPreview | null;
  schema: DatasetSchema | null;
  stats: DatasetStats | null;
  isLoading: boolean;
  isLoadingStats: boolean;
  error: string | null;

  loadDatasets: () => Promise<void>;
  importDataset: (path: string, name?: string) => Promise<void>;
  removeDataset: (id: string) => Promise<void>;
  selectDataset: (id: string | null) => void;
  fetchPreview: (id: string, limit?: number) => Promise<void>;
  fetchSchema: (id: string) => Promise<void>;
  fetchStats: (id: string) => Promise<void>;
  clearError: () => void;
}

const DatasetContext = createContext<DatasetState | null>(null);

export function DatasetProvider({ children }: { children: React.ReactNode }) {
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<LoaderPreview | null>(null);
  const [schema, setSchema] = useState<DatasetSchema | null>(null);
  const [stats, setStats] = useState<DatasetStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const fetchPreview = async (id: string, limit = 100) => {
    try {
      const nextPreview = await datasetService.getDatasetPreview(id, limit);
      setPreview(nextPreview);
    } catch (e) {
      const errorMessage = errorToMessage(e);
      setError(errorMessage);
      if (!errorMessage.includes("not yet implemented")) {
        toast.warning(errorMessage, "Preview Load Failed", 5000);
      }
    }
  };

  const fetchSchema = async (id: string) => {
    try {
      const nextSchema = await statsService.getSchema(id);
      setSchema(nextSchema);
    } catch (e) {
      const errorMessage = errorToMessage(e);
      setError(errorMessage);
      if (!errorMessage.includes("not yet implemented")) {
        toast.warning(errorMessage, "Schema Load Failed", 5000);
      }
    }
  };

  const value = useMemo<DatasetState>(
    () => ({
      datasets,
      selectedId,
      preview,
      schema,
      stats,
      isLoading,
      isLoadingStats,
      error,
      loadDatasets: async () => {
        setIsLoading(true);
        setError(null);
        try {
          const nextDatasets = await datasetService.listDatasets();
          setDatasets(nextDatasets);
          setIsLoading(false);
        } catch (e) {
          const errorMessage = errorToMessage(e);
          setError(errorMessage);
          setIsLoading(false);
          toast.error(errorMessage, "Failed to load datasets");
        }
      },
      importDataset: async (path: string, name?: string) => {
        setIsLoading(true);
        setError(null);
        try {
          const info = await datasetService.loadDataset(path, name);
          setDatasets((current) => [info, ...current]);
          setSelectedId(info.id);
          setIsLoading(false);
          toast.success(
            `Dataset imported: ${info.name} (${info.row_count?.toLocaleString()} rows)`,
            "Import Successful",
            4000,
          );
        } catch (e) {
          const errorMessage = errorToMessage(e);
          setError(errorMessage);
          setIsLoading(false);
          toast.error(errorMessage, "Import Failed");
        }
      },
      removeDataset: async (id: string) => {
        try {
          await datasetService.removeDataset(id);
          setDatasets((current) => current.filter((dataset) => dataset.id !== id));
          setSelectedId((current) => (current === id ? null : current));
          if (selectedId === id) {
            setPreview(null);
            setSchema(null);
            setStats(null);
          }
          toast.success("Dataset removed", undefined, 3000);
        } catch (e) {
          const errorMessage = errorToMessage(e);
          setError(errorMessage);
          toast.error(errorMessage, "Remove Failed");
        }
      },
      selectDataset: (id: string | null) => {
        setSelectedId(id);
        setPreview(null);
        setSchema(null);
        setStats(null);
        if (id) {
          void fetchPreview(id);
          void fetchSchema(id);
        }
      },
      fetchPreview,
      fetchSchema,
      fetchStats: async (id: string) => {
        setIsLoadingStats(true);
        try {
          const nextStats = await statsService.getStatistics(id);
          setStats(nextStats);
          setIsLoadingStats(false);
        } catch (e) {
          const errorMessage = errorToMessage(e);
          setError(errorMessage);
          setIsLoadingStats(false);
          toast.error(errorMessage, "Statistics Computation Failed");
        }
      },
      clearError: () => setError(null),
    }),
    [datasets, selectedId, preview, schema, stats, isLoading, isLoadingStats, error, toast],
  );

  return React.createElement(DatasetContext.Provider, { value }, children);
}

export function useDatasetStore() {
  const context = useContext(DatasetContext);
  if (!context) {
    throw new Error("useDatasetStore must be used within DatasetProvider");
  }
  return context;
}
