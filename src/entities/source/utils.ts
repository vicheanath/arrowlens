import type { DatabaseConnectionInfo } from "../../models/database";
import type { DatasetInfo, DatasetSchema } from "../../models/dataset";
import { sanitizeSqlIdentifier } from "../../utils/sql";
import { DEFAULT_SOURCE_CATALOG_ADAPTERS, type SourceCatalogAdapter } from "./adapters";
import { createDatabaseSource, createDatasetSource } from "./factories";
import type { DatabaseSource, DatasetSource, Source, SourceCapability } from "./types";

export { createDatabaseSource, createDatasetSource } from "./factories";

export function parseDatasetColumnsFromSchemaJson(schemaJson: string | null | undefined): string[] {
  if (!schemaJson) return [];
  try {
    const parsed = JSON.parse(schemaJson) as Array<{ name?: string }>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((field) => field?.name)
      .filter((name): name is string => typeof name === "string" && name.length > 0);
  } catch {
    return [];
  }
}

export function buildSourceCatalog(
  datasets: DatasetInfo[],
  connections: DatabaseConnectionInfo[],
  tablesByConnection: Record<string, string[]>,
  adapters: SourceCatalogAdapter[] = DEFAULT_SOURCE_CATALOG_ADAPTERS,
): Source[] {
  const context = { datasets, connections, tablesByConnection };
  return adapters.flatMap((adapter) => adapter.createSources(context));
}

export function findActiveSource(
  sources: Source[],
  selectedConnectionId: string | null,
  selectedDatasetId: string | null,
): Source | null {
  if (selectedConnectionId) {
    return sources.find((source) => source.kind === "database" && source.connectionId === selectedConnectionId) ?? null;
  }

  if (selectedDatasetId) {
    return sources.find((source) => source.kind === "dataset" && source.datasetId === selectedDatasetId) ?? null;
  }

  return null;
}

export function buildCompletionSchema(
  sources: Source[],
  selectedDatasetSource: DatasetSource | null,
  selectedDatasetSchema: DatasetSchema | null,
): Record<string, unknown> {
  const completion: Record<string, unknown> = {};

  for (const source of sources) {
    if (source.kind === "database") {
      for (const tableName of source.tables) {
        const parts = tableName.split(".");
        if (parts.length > 1) {
          const schemaName = parts[0];
          const relationName = parts.slice(1).join(".");
          const schemaBucket = (completion[schemaName] as Record<string, string[]> | undefined) ?? {};
          schemaBucket[relationName] = schemaBucket[relationName] ?? [];
          completion[schemaName] = schemaBucket;
        } else {
          completion[tableName] = [];
        }
      }
      continue;
    }

    const key = sanitizeSqlIdentifier(source.name);
    completion[key] = parseDatasetColumnsFromSchemaJson(source.schemaJson);
  }

  if (selectedDatasetSource && selectedDatasetSchema?.fields?.length) {
    const key = sanitizeSqlIdentifier(selectedDatasetSource.name);
    const existing = completion[key];
    if (!Array.isArray(existing) || existing.length === 0) {
      completion[key] = selectedDatasetSchema.fields.map((field) => field.name);
    }
  }

  return completion;
}

export function buildSourceRecommendations(activeSource: Source | null, datasets: DatasetInfo[]): string[] {
  if (activeSource?.kind === "database") {
    return activeSource.tables.slice(0, 12);
  }

  return datasets.map((dataset) => sanitizeSqlIdentifier(dataset.name)).slice(0, 12);
}

export function hasSourceCapability(
  source: Source | null,
  capability: SourceCapability,
  fallback = true,
): boolean {
  if (!source) return fallback;
  return source.capabilities.includes(capability);
}
