import { quoteIdentifier, type SqlDialect } from "../../utils/sql";

export type AlterOperation =
  | {
      kind: "add_column";
      table: string;
      column: string;
      dataType: string;
      notNull: boolean;
      defaultExpr: string;
    }
  | { kind: "rename_column"; table: string; column: string; newName: string }
  | { kind: "drop_column"; table: string; column: string }
  | { kind: "rename_table"; table: string; newName: string };

/**
 * Generate a dialect-aware `ALTER TABLE` statement for a single schema edit.
 * Identifier quoting follows the engine (double quotes vs. backticks); the
 * column type and DEFAULT expression are passed through verbatim so callers
 * can use engine-native syntax. Returns null for an incomplete operation.
 */
export function buildAlterSql(op: AlterOperation, dialect: SqlDialect): string | null {
  const table = quoteIdentifier(op.table, dialect);

  switch (op.kind) {
    case "add_column": {
      if (!op.column.trim() || !op.dataType.trim()) return null;
      const col = quoteIdentifier(op.column.trim(), dialect);
      let sql = `ALTER TABLE ${table} ADD COLUMN ${col} ${op.dataType.trim()}`;
      if (op.notNull) sql += " NOT NULL";
      if (op.defaultExpr.trim()) sql += ` DEFAULT ${op.defaultExpr.trim()}`;
      return `${sql};`;
    }
    case "rename_column": {
      if (!op.column.trim() || !op.newName.trim()) return null;
      const from = quoteIdentifier(op.column.trim(), dialect);
      const to = quoteIdentifier(op.newName.trim(), dialect);
      return `ALTER TABLE ${table} RENAME COLUMN ${from} TO ${to};`;
    }
    case "drop_column": {
      if (!op.column.trim()) return null;
      const col = quoteIdentifier(op.column.trim(), dialect);
      return `ALTER TABLE ${table} DROP COLUMN ${col};`;
    }
    case "rename_table": {
      if (!op.newName.trim()) return null;
      const to = quoteIdentifier(op.newName.trim(), dialect);
      return `ALTER TABLE ${table} RENAME TO ${to};`;
    }
    default:
      return null;
  }
}

/** Example column types shown as autocomplete hints, per engine. */
export function commonColumnTypes(dialect: SqlDialect): string[] {
  switch (dialect) {
    case "postgres":
      return ["text", "varchar(255)", "integer", "bigint", "boolean", "numeric", "timestamptz", "date", "uuid", "jsonb"];
    case "mysql":
      return ["VARCHAR(255)", "TEXT", "INT", "BIGINT", "TINYINT(1)", "DECIMAL(10,2)", "DATETIME", "DATE", "JSON"];
    case "sqlite":
      return ["TEXT", "INTEGER", "REAL", "NUMERIC", "BLOB"];
    case "mssql":
      return ["NVARCHAR(255)", "VARCHAR(255)", "INT", "BIGINT", "BIT", "DECIMAL(10,2)", "DATETIME2", "DATE", "UNIQUEIDENTIFIER"];
    default:
      return ["TEXT", "INTEGER", "REAL", "BOOLEAN", "TIMESTAMP"];
  }
}
