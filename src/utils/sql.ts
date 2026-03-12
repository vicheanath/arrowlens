import { DatabaseType } from "../models/database";

export type SqlDialect = "datafusion" | DatabaseType;

/** Format a SQL string with basic indentation. */
export function formatSql(sql: string): string {
  const keywords = [
    "SELECT",
    "FROM",
    "WHERE",
    "GROUP BY",
    "ORDER BY",
    "HAVING",
    "LIMIT",
    "OFFSET",
    "JOIN",
    "LEFT JOIN",
    "RIGHT JOIN",
    "INNER JOIN",
    "OUTER JOIN",
    "ON",
    "AND",
    "OR",
    "UNION",
    "UNION ALL",
    "INTERSECT",
    "EXCEPT",
    "WITH",
    "INSERT INTO",
    "UPDATE",
    "DELETE",
  ];

  let result = sql.trim();
  for (const kw of keywords) {
    const re = new RegExp(`\\b${kw}\\b`, "gi");
    result = result.replace(re, `\n${kw}`);
  }
  return result.trim();
}

export function getDialectLabel(dialect: SqlDialect): string {
  switch (dialect) {
    case "sqlite":
      return "SQLite";
    case "mysql":
      return "MySQL";
    case "postgres":
      return "PostgreSQL";
    default:
      return "DataFusion";
  }
}

export function getDefaultSqlForDialect(dialect: SqlDialect): string {
  const label = getDialectLabel(dialect);
  const exampleTable = dialect === "datafusion" ? "my_table" : "users";
  const exampleIdentifier = quoteIdentifier(exampleTable, dialect);

  return `-- ArrowLens SQL Workspace\n-- Active dialect: ${label}\n-- Example:\n-- SELECT * FROM ${exampleIdentifier} LIMIT 100;\n`;
}

/**
 * Mirror backend table-name sanitization so UI-generated queries always reference
 * the same DataFusion table identifiers.
 */
export function sanitizeSqlIdentifier(name: string): string {
  const sanitized = name
    .split("")
    .map((c) => (/[A-Za-z0-9_]/.test(c) ? c : "_"))
    .join("")
    .replace(/^[0-9]+/, "")
    .toLowerCase();

  return sanitized || "dataset";
}

/** Quote an identifier to safely handle reserved words and special characters. */
export function quoteIdentifier(
  identifier: string,
  dialect: SqlDialect = "datafusion",
): string {
  if (dialect === "mysql") {
    return `\`${identifier.replace(/`/g, "``")}\``;
  }
  return `"${identifier.replace(/"/g, '""')}"`;
}

/** Extract the table names referenced in a SQL query (naive implementation). */
export function extractTableNames(sql: string): string[] {
  const fromRegex = /\bFROM\s+["']?(\w+)["']?/gi;
  const joinRegex = /\bJOIN\s+["']?(\w+)["']?/gi;
  const names = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = fromRegex.exec(sql)) !== null) names.add(match[1]);
  while ((match = joinRegex.exec(sql)) !== null) names.add(match[1]);

  return Array.from(names);
}

/** Build a quick SELECT * FROM table query. */
export function buildSelectAll(
  tableName: string,
  limit = 100,
  dialect: SqlDialect = "datafusion",
): string {
  const resolvedTable =
    dialect === "datafusion" ? sanitizeSqlIdentifier(tableName) : tableName;
  const table = quoteIdentifier(resolvedTable, dialect);
  return `SELECT *\nFROM ${table}\nLIMIT ${limit};`;
}

/** Build a single-column quick query with safe identifiers. */
export function buildSelectColumn(
  tableName: string,
  columnName: string,
  limit = 100,
  dialect: SqlDialect = "datafusion",
): string {
  const resolvedTable =
    dialect === "datafusion" ? sanitizeSqlIdentifier(tableName) : tableName;
  const table = quoteIdentifier(resolvedTable, dialect);
  const column = quoteIdentifier(columnName, dialect);
  return `SELECT ${column}\nFROM ${table}\nLIMIT ${limit};`;
}

/** Build a column statistics query. */
export function buildStatsQuery(
  tableName: string,
  column: string,
  dialect: SqlDialect = "datafusion",
): string {
  const resolvedTable =
    dialect === "datafusion" ? sanitizeSqlIdentifier(tableName) : tableName;
  const table = quoteIdentifier(resolvedTable, dialect);
  const col = quoteIdentifier(column, dialect);
  return `SELECT
  COUNT(*) AS total,
  COUNT(${col}) AS non_null,
  COUNT(*) - COUNT(${col}) AS null_count,
  MIN(${col}) AS min_val,
  MAX(${col}) AS max_val,
  AVG(${col}) AS mean_val
FROM ${table};`;
}
