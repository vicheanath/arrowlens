import { useCallback, useMemo } from "react";
import { useDatabaseActions, useDatabaseState } from "../../state/databaseStore";
import { useDatasetActions, useDatasetCollectionState, useDatasetMetadataState } from "../../state/datasetStore";
import {
  buildCompletionSchema,
  buildSourceCatalog,
  buildSourceRecommendations,
  findActiveSource,
  hasSourceCapability,
} from "../../entities/source/utils";
import type { DatabaseSource, DatasetSource, Source } from "../../entities/source/types";

export function useSourceCatalog() {
  const { connections, selectedConnectionId, tablesByConnection } = useDatabaseState();
  const { selectConnection } = useDatabaseActions();
  const { datasets, selectedId } = useDatasetCollectionState();
  const { schema } = useDatasetMetadataState();
  const { selectDataset } = useDatasetActions();

  const sources = useMemo(
    () => buildSourceCatalog(datasets, connections, tablesByConnection),
    [connections, datasets, tablesByConnection],
  );

  const activeSource = useMemo(
    () => findActiveSource(sources, selectedConnectionId, selectedId),
    [selectedConnectionId, selectedId, sources],
  );

  const datasetSources = useMemo(
    () => sources.filter((source): source is DatasetSource => source.kind === "dataset"),
    [sources],
  );

  const databaseSources = useMemo(
    () => sources.filter((source): source is DatabaseSource => source.kind === "database"),
    [sources],
  );

  const selectedDatasetSource = useMemo(
    () => (activeSource?.kind === "dataset" ? activeSource : null) as DatasetSource | null,
    [activeSource],
  );

  const completionSchema = useMemo(
    () => buildCompletionSchema(sources, selectedDatasetSource, schema),
    [schema, selectedDatasetSource, sources],
  );

  const recommendations = useMemo(
    () => buildSourceRecommendations(activeSource, datasets),
    [activeSource, datasets],
  );

  const selectSource = useCallback(async (source: Source | null) => {
    if (!source) {
      await selectConnection(null);
      selectDataset(null);
      return;
    }

    if (source.kind === "database") {
      selectDataset(null);
      await selectConnection(source.connectionId);
      return;
    }

    await selectConnection(null);
    selectDataset(source.datasetId);
  }, [selectConnection, selectDataset]);

  return {
    sources,
    datasetSources,
    databaseSources,
    activeSource,
    canQuery: hasSourceCapability(activeSource, "query"),
    canStream: hasSourceCapability(activeSource, "streaming"),
    canExplain: hasSourceCapability(activeSource, "explain"),
    canPreview: hasSourceCapability(activeSource, "preview"),
    canStats: hasSourceCapability(activeSource, "stats"),
    canInspectTables: hasSourceCapability(activeSource, "tables"),
    activeDialect: activeSource?.dialect ?? "datafusion",
    activeSourceLabel: activeSource?.label ?? "Local datasets",
    selectedConnectionId,
    selectedDatasetId: selectedId,
    completionSchema,
    sourceRecommendations: recommendations,
    selectedDatasetSchema: schema,
    selectSource,
  };
}
