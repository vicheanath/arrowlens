import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
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

interface DatasetCollectionState {
  datasets: DatasetInfo[];
  selectedId: string | null;
  isLoading: boolean;
  error: string | null;
}

interface DatasetMetadataState {
  preview: LoaderPreview | null;
  schema: DatasetSchema | null;
  stats: DatasetStats | null;
  isLoadingStats: boolean;
}

interface DatasetActions {
  loadDatasets: () => Promise<void>;
  importDataset: (path: string, name?: string) => Promise<void>;
  removeDataset: (id: string) => Promise<void>;
  selectDataset: (id: string | null) => void;
  fetchPreview: (id: string, limit?: number) => Promise<void>;
  fetchSchema: (id: string) => Promise<void>;
  fetchStats: (id: string) => Promise<void>;
  clearError: () => void;
}

const DatasetCollectionContext = createContext<DatasetCollectionState | null>(null);
const DatasetMetadataContext = createContext<DatasetMetadataState | null>(null);
const DatasetActionsContext = createContext<DatasetActions | null>(null);

export function DatasetProvider({ children }: { children: React.ReactNode }) {
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<LoaderPreview | null>(null);
  const [schema, setSchema] = useState<DatasetSchema | null>(null);
  const [stats, setStats] = useState<DatasetStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { success, error: showError, warning } = useToast();

  const fetchPreview = useCallback(async (id: string, limit = 100) => {
    try {
      const nextPreview = await datasetService.getDatasetPreview(id, limit);
      setPreview(nextPreview);
    } catch (e) {
      const errorMessage = errorToMessage(e);
      setError(errorMessage);
      if (!errorMessage.includes("not yet implemented")) {
        warning(errorMessage, "Preview Load Failed", 5000);
      }
    }
  }, [warning]);

  const fetchSchema = useCallback(async (id: string) => {
    try {
      const nextSchema = await statsService.getSchema(id);
      setSchema(nextSchema);
    } catch (e) {
      const errorMessage = errorToMessage(e);
      setError(errorMessage);
      if (!errorMessage.includes("not yet implemented")) {
        warning(errorMessage, "Schema Load Failed", 5000);
      }
    }
  }, [warning]);

  const loadDatasets = useCallback(async () => {
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
      showError(errorMessage, "Failed to load datasets");
    }
  }, [showError]);

  const importDataset = useCallback(async (path: string, name?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const info = await datasetService.loadDataset(path, name);
      setDatasets((current) => [info, ...current]);
      setSelectedId(info.id);
      setIsLoading(false);
      success(
        `Dataset imported: ${info.name} (${info.row_count?.toLocaleString()} rows)`,
        "Import Successful",
        4000,
      );
    } catch (e) {
      const errorMessage = errorToMessage(e);
      setError(errorMessage);
      setIsLoading(false);
      showError(errorMessage, "Import Failed");
    }
  }, [showError, success]);

  const removeDataset = useCallback(async (id: string) => {
    try {
      await datasetService.removeDataset(id);
      setDatasets((current) => current.filter((dataset) => dataset.id !== id));
      setSelectedId((current) => (current === id ? null : current));
      setPreview((current) => (selectedId === id ? null : current));
      setSchema((current) => (selectedId === id ? null : current));
      setStats((current) => (selectedId === id ? null : current));
      success("Dataset removed", undefined, 3000);
    } catch (e) {
      const errorMessage = errorToMessage(e);
      setError(errorMessage);
      showError(errorMessage, "Remove Failed");
    }
  }, [selectedId, showError, success]);

  const selectDataset = useCallback((id: string | null) => {
    setSelectedId(id);
    setPreview(null);
    setSchema(null);
    setStats(null);
    if (id) {
      void fetchPreview(id);
      void fetchSchema(id);
    }
  }, [fetchPreview, fetchSchema]);

  const fetchStats = useCallback(async (id: string) => {
    setIsLoadingStats(true);
    try {
      const nextStats = await statsService.getStatistics(id);
      setStats(nextStats);
      setIsLoadingStats(false);
    } catch (e) {
      const errorMessage = errorToMessage(e);
      setError(errorMessage);
      setIsLoadingStats(false);
      showError(errorMessage, "Statistics Computation Failed");
    }
  }, [showError]);

  const clearError = useCallback(() => setError(null), []);

  const collectionValue = useMemo(
    () => ({
      datasets,
      selectedId,
      isLoading,
      error,
    }),
    [datasets, selectedId, isLoading, error],
  );

  const metadataValue = useMemo(
    () => ({
      preview,
      schema,
      stats,
      isLoadingStats,
    }),
    [preview, schema, stats, isLoadingStats],
  );

  const actionsValue = useMemo(
    () => ({
      loadDatasets,
      importDataset,
      removeDataset,
      selectDataset,
      fetchPreview,
      fetchSchema,
      fetchStats,
      clearError,
    }),
    [loadDatasets, importDataset, removeDataset, selectDataset, fetchPreview, fetchSchema, fetchStats, clearError],
  );

  return React.createElement(
    DatasetCollectionContext.Provider,
    { value: collectionValue },
    React.createElement(
      DatasetMetadataContext.Provider,
      { value: metadataValue },
      React.createElement(DatasetActionsContext.Provider, { value: actionsValue }, children),
    ),
  );
}

function useRequiredDatasetContext<T>(context: React.Context<T | null>, name: string): T {
  const value = useContext(context);
  if (!value) {
    throw new Error(`${name} must be used within DatasetProvider`);
  }
  return value;
}

export function useDatasetCollectionState() {
  return useRequiredDatasetContext(DatasetCollectionContext, "useDatasetCollectionState");
}

export function useDatasetMetadataState() {
  return useRequiredDatasetContext(DatasetMetadataContext, "useDatasetMetadataState");
}

export function useDatasetActions() {
  return useRequiredDatasetContext(DatasetActionsContext, "useDatasetActions");
}

export function useDatasetStore(): DatasetState {
  return {
    ...useDatasetCollectionState(),
    ...useDatasetMetadataState(),
    ...useDatasetActions(),
  };
}
