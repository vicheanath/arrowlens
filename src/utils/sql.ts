import { DatabaseType } from "../models/database";
import { getDatabaseProvider } from "../models/databaseProviders";

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

/** SQL leading keywords that modify data or schema. */
const WRITE_KEYWORDS = new Set([
  "insert", "update", "delete", "merge", "replace", "upsert",
  "drop", "alter", "create", "truncate", "rename",
  "grant", "revoke", "vacuum", "reindex",
  "call", "copy", "attach", "detach", "comment",
]);

/**
 * Lightweight statement splitter for classification only: strips line/block
 * comments and splits on `;` outside string literals. Not a full parser.
 */
function splitStatementsLite(sql: string): string[] {
  const out: string[] = [];
  let current = "";
  let state: "normal" | "single" | "double" | "line" | "block" = "normal";
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    const next = sql[i + 1];
    if (state === "normal") {
      if (c === "'") { state = "single"; current += c; }
      else if (c === '"') { state = "double"; current += c; }
      else if (c === "-" && next === "-") { state = "line"; i += 2; continue; }
      else if (c === "/" && next === "*") { state = "block"; i += 2; continue; }
      else if (c === ";") { out.push(current); current = ""; }
      else current += c;
    } else if (state === "single") {
      current += c;
      if (c === "'") state = "normal";
    } else if (state === "double") {
      current += c;
      if (c === '"') state = "normal";
    } else if (state === "line") {
      if (c === "\n") { state = "normal"; current += c; }
    } else if (state === "block") {
      if (c === "*" && next === "/") { state = "normal"; i += 2; continue; }
    }
    i += 1;
  }
  out.push(current);
  return out.map((s) => s.trim()).filter(Boolean);
}

/**
 * Detect whether a SQL script contains statements that modify data or schema,
 * for a destructive-action confirmation gate. Heuristic (leading keyword per
 * statement) — errs toward prompting; a `WITH ... DELETE` CTE is a known blind
 * spot.
 */
export function classifyWriteSql(sql: string): { isWrite: boolean; kinds: string[] } {
  const kinds = new Set<string>();
  for (const stmt of splitStatementsLite(sql)) {
    const match = stmt.replace(/^[\s(]+/, "").match(/^([a-zA-Z]+)/);
    if (!match) continue;
    const keyword = match[1].toLowerCase();
    if (WRITE_KEYWORDS.has(keyword)) kinds.add(keyword.toUpperCase());
  }
  return { isWrite: kinds.size > 0, kinds: Array.from(kinds) };
}

/** True when `sql` contains exactly one (non-empty) statement. Used to decide
 * whether a query can be lazily paginated (only single statements can). */
export function isSingleStatement(sql: string): boolean {
  return splitStatementsLite(sql).filter((stmt) => stmt.trim().length > 0).length <= 1;
}

export function getDialectLabel(dialect: SqlDialect): string {
  if (dialect === "datafusion") return "DataFusion";
  return getDatabaseProvider(dialect).dialectLabel;
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
  const quoteStyle =
    dialect === "datafusion" ? "double" : getDatabaseProvider(dialect).identifierQuote;

  const quotePart = (part: string): string => {
    switch (quoteStyle) {
      case "backtick":
        return `\`${part.replace(/`/g, "``")}\``;
      case "bracket":
        return `[${part.replace(/]/g, "]]")}]`;
      default:
        return `"${part.replace(/"/g, '""')}"`;
    }
  };

  // Support qualified identifiers such as schema.table and db.schema.table.
  return identifier
    .split(".")
    .filter((part) => part.length > 0)
    .map(quotePart)
    .join(".");
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
