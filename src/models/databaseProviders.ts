import { DatabaseType } from "./database";

/**
 * Single source of truth for everything UI- and dialect-specific about a
 * database engine. Adding support for a new engine is a matter of adding one
 * descriptor here (and the matching backend provider) — the connection form,
 * sidebar metadata, and SQL helpers all derive from this registry.
 */

/** How the user supplies the connection: pick a file, or type a URL. */
export type ConnectionMode = "file" | "url";

/** Identifier-quoting style used when generating SQL for this engine. */
export type IdentifierQuote = "double" | "backtick" | "bracket";

export interface DatabaseProviderDescriptor {
  /** Matches the backend `DatabaseType` and the Tauri command payloads. */
  type: DatabaseType;
  /** Short label, e.g. "SQLite". */
  label: string;
  /** Full dialect label for status/help text, e.g. "PostgreSQL". */
  dialectLabel: string;
  /** Tailwind text-color class for the engine accent. */
  color: string;
  /** Whether the connection is a local file or a server URL. */
  connectionMode: ConnectionMode;
  /** Placeholder for the connection-URL input (URL mode only). */
  urlPlaceholder?: string;
  /** Placeholder for the optional connection-name input. */
  namePlaceholder: string;
  /** Identifier-quoting style for generated SQL. */
  identifierQuote: IdentifierQuote;
}

export const DATABASE_PROVIDERS: Record<DatabaseType, DatabaseProviderDescriptor> = {
  sqlite: {
    type: "sqlite",
    label: "SQLite",
    dialectLabel: "SQLite",
    color: "text-blue-400",
    connectionMode: "file",
    namePlaceholder: "e.g. local-db",
    identifierQuote: "double",
  },
  mysql: {
    type: "mysql",
    label: "MySQL",
    dialectLabel: "MySQL",
    color: "text-amber-400",
    connectionMode: "url",
    urlPlaceholder: "mysql://user:pass@localhost:3306/db",
    namePlaceholder: "e.g. dev-mysql",
    identifierQuote: "backtick",
  },
  postgres: {
    type: "postgres",
    label: "Postgres",
    dialectLabel: "PostgreSQL",
    color: "text-emerald-400",
    connectionMode: "url",
    urlPlaceholder: "postgres://user:pass@localhost:5432/db",
    namePlaceholder: "e.g. prod-pg",
    identifierQuote: "double",
  },
  mssql: {
    type: "mssql",
    label: "SQL Server",
    dialectLabel: "SQL Server",
    color: "text-red-400",
    connectionMode: "url",
    urlPlaceholder:
      "Server=localhost,1433;Database=db;User Id=sa;Password=…;TrustServerCertificate=true",
    namePlaceholder: "e.g. prod-mssql",
    identifierQuote: "bracket",
  },
};

/** Providers in display order — drives the connection-form type picker. */
export const DATABASE_PROVIDER_LIST: DatabaseProviderDescriptor[] =
  Object.values(DATABASE_PROVIDERS);

export function getDatabaseProvider(type: DatabaseType): DatabaseProviderDescriptor {
  return DATABASE_PROVIDERS[type];
}
