import { linter, type Diagnostic } from "@codemirror/lint";
import type { Extension } from "@uiw/react-codemirror";
import { Parser } from "node-sql-parser";

/**
 * Maps an ArrowLens dialect string to the database name understood by
 * node-sql-parser. Anything not listed here (e.g. "datafusion", the dataset
 * query path) is intentionally left unlinted — running it through a relational
 * grammar would produce false positives on valid DataFusion SQL.
 */
const PARSER_DIALECT: Record<string, string> = {
  postgres: "PostgreSQL",
  mysql: "MySQL",
  sqlite: "Sqlite",
};

/** node-sql-parser throws PEG.js-style errors carrying a source location. */
interface SqlParseError {
  message?: string;
  location?: {
    start?: { offset?: number };
    end?: { offset?: number };
  };
}

// A single reusable parser instance — astify() is stateless across calls.
const parser = new Parser();

function toDiagnostic(error: SqlParseError, docLength: number): Diagnostic {
  const start = error.location?.start?.offset;
  const end = error.location?.end?.offset;

  // Clamp the reported range into the document. node-sql-parser usually points
  // at the offending token; when it doesn't, fall back to the whole document so
  // the squiggle is still visible rather than silently dropped.
  const from = typeof start === "number" ? Math.min(Math.max(start, 0), docLength) : 0;
  const to =
    typeof end === "number" ? Math.min(Math.max(end, from), docLength) : Math.min(from + 1, docLength);

  return {
    from,
    to: to > from ? to : Math.min(from + 1, docLength),
    severity: "error",
    source: "sql",
    message: (error.message ?? "SQL syntax error").trim(),
  };
}

/**
 * Builds a CodeMirror lint extension that flags SQL syntax errors for the given
 * dialect. Returns an empty extension array for dialects we don't validate, so
 * the editor still works (just without squiggles) for those.
 */
export function buildSqlLinter(dialectName: string | undefined): Extension {
  const database = dialectName ? PARSER_DIALECT[dialectName] : undefined;
  if (!database) return [];

  return linter(
    (view) => {
      const sql = view.state.doc.toString();
      // Empty/whitespace-only input isn't an error — don't nag on a blank editor.
      if (sql.trim().length === 0) return [];

      try {
        parser.astify(sql, { database });
        return [];
      } catch (error) {
        return [toDiagnostic(error as SqlParseError, sql.length)];
      }
    },
    // Debounce so we don't re-parse on every keystroke while the user is typing.
    { delay: 600 },
  );
}
