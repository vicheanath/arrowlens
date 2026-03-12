import { create } from "zustand";
import { DatasetInfo, DatasetSchema, LoaderPreview } from "../models/dataset";
import { DatasetStats } from "../models/statistics";
import * as datasetService from "../services/datasetService";
import * as statsService from "../services/statsService";
import { useToastStore } from "../utils/toast";
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

export const useDatasetStore = create<DatasetState>((set, get) => ({
  datasets: [],
  selectedId: null,
  preview: null,
  schema: null,
  stats: null,
  isLoading: false,
  isLoadingStats: false,
  error: null,

  loadDatasets: async () => {
    set({ isLoading: true, error: null });
    try {
      const datasets = await datasetService.listDatasets();
      set({ datasets, isLoading: false });
    } catch (e) {
      const errorMessage = errorToMessage(e);
      set({ error: errorMessage, isLoading: false });
      useToastStore.getState().addToast({
        type: "error",
        message: errorMessage,
        title: "Failed to load datasets",
      });
    }
  },

  importDataset: async (path: string, name?: string) => {
    set({ isLoading: true, error: null });
    try {
      const info = await datasetService.loadDataset(path, name);
      set((s) => ({
        datasets: [info, ...s.datasets],
        selectedId: info.id,
        isLoading: false,
      }));
      useToastStore.getState().addToast({
        type: "success",
        message: `Dataset imported: ${info.name} (${info.row_count?.toLocaleString()} rows)`,
        title: "Import Successful",
        duration: 4000,
      });
    } catch (e) {
      const errorMessage = errorToMessage(e);
      set({ error: errorMessage, isLoading: false });
      useToastStore.getState().addToast({
        type: "error",
        message: errorMessage,
        title: "Import Failed",
      });
    }
  },

  removeDataset: async (id: string) => {
    try {
      await datasetService.removeDataset(id);
      set((s) => ({
        datasets: s.datasets.filter((d) => d.id !== id),
        selectedId: s.selectedId === id ? null : s.selectedId,
        preview: s.selectedId === id ? null : s.preview,
        schema: s.selectedId === id ? null : s.schema,
        stats: s.selectedId === id ? null : s.stats,
      }));
      useToastStore.getState().addToast({
        type: "success",
        message: "Dataset removed",
        duration: 3000,
      });
    } catch (e) {
      const errorMessage = errorToMessage(e);
      set({ error: errorMessage });
      useToastStore.getState().addToast({
        type: "error",
        message: errorMessage,
        title: "Remove Failed",
      });
    }
  },

  selectDataset: (id: string | null) => {
    set({ selectedId: id, preview: null, schema: null, stats: null });
    if (id) {
      get().fetchPreview(id);
      get().fetchSchema(id);
    }
  },

  fetchPreview: async (id: string, limit = 100) => {
    try {
      const preview = await datasetService.getDatasetPreview(id, limit);
      set({ preview });
    } catch (e) {
      const errorMessage = errorToMessage(e);
      set({ error: errorMessage });
      // Only show preview errors as info since they're not critical
      if (!errorMessage.includes("not yet implemented")) {
        useToastStore.getState().addToast({
          type: "warning",
          message: errorMessage,
          title: "Preview Load Failed",
          duration: 5000,
        });
      }
    }
  },

  fetchSchema: async (id: string) => {
    try {
      const schema = await statsService.getSchema(id);
      set({ schema });
    } catch (e) {
      const errorMessage = errorToMessage(e);
      set({ error: errorMessage });
      if (!errorMessage.includes("not yet implemented")) {
        useToastStore.getState().addToast({
          type: "warning",
          message: errorMessage,
          title: "Schema Load Failed",
          duration: 5000,
        });
      }
    }
  },

  fetchStats: async (id: string) => {
    set({ isLoadingStats: true });
    try {
      const stats = await statsService.getStatistics(id);
      set({ stats, isLoadingStats: false });
    } catch (e) {
      const errorMessage = errorToMessage(e);
      set({ error: errorMessage, isLoadingStats: false });
      useToastStore.getState().addToast({
        type: "error",
        message: errorMessage,
        title: "Statistics Computation Failed",
      });
    }
  },

  clearError: () => set({ error: null }),
}));
