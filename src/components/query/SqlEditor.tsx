import React from "react";
import CodeMirror, { Compartment, EditorView, ReactCodeMirrorProps } from "@uiw/react-codemirror";
import { sql as sqlLang, SQLDialect } from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";
import { buildSqlLinter } from "./sqlLinter";

// Module-level constants so their identity never changes between renders —
// passing fresh object literals would make CodeMirror reconfigure every time.
const BASIC_SETUP: ReactCodeMirrorProps["basicSetup"] = {
  lineNumbers: true,
  highlightActiveLineGutter: true,
  highlightSpecialChars: true,
  history: true,
  foldGutter: true,
  drawSelection: true,
  dropCursor: true,
  allowMultipleSelections: true,
  indentOnInput: true,
  syntaxHighlighting: true,
  bracketMatching: true,
  closeBrackets: true,
  autocompletion: true,
  rectangularSelection: true,
  crosshairCursor: false,
  highlightActiveLine: true,
  highlightSelectionMatches: true,
};

const EDITOR_STYLE: React.CSSProperties = {
  fontSize: 13,
  fontFamily: '"JetBrains Mono", "Fira Code", monospace',
  // Fill the (now resizable) panel that wraps the editor instead of a fixed height.
  height: "100%",
};

/** Dialect + autocomplete schema for the SQL language extension. */
export interface SqlLangConfig {
  dialect: SQLDialect;
  upperCaseKeywords?: boolean;
  schema?: Record<string, unknown>;
  /** Raw dialect name (e.g. "postgres") used to pick the syntax linter. */
  dialectName?: string;
}

function buildSqlExtension(config: SqlLangConfig) {
  // `schema` is a Record here; the lang-sql typings want SQLNamespace.
  // Pair the language with a dialect-aware syntax linter so the editor shows
  // inline squiggles for invalid SQL before the query is ever run.
  return [
    sqlLang(config as unknown as Parameters<typeof sqlLang>[0]),
    buildSqlLinter(config.dialectName),
  ];
}

interface SqlEditorProps {
  value: string;
  placeholder?: string;
  langConfig: SqlLangConfig;
  onChange: (value: string) => void;
  onCreateEditor: (view: EditorView) => void;
}

/**
 * Memoized SQL editor. The dialect + autocomplete schema live in a CodeMirror
 * Compartment, so when the schema finishes loading (shortly after mount) we
 * reconfigure just that compartment instead of rebuilding the whole extension
 * set. That removes the first-render flash and avoids reconfiguring the editor
 * on unrelated workspace state changes.
 */
function SqlEditorComponent({
  value,
  placeholder,
  langConfig,
  onChange,
  onCreateEditor,
}: SqlEditorProps) {
  const viewRef = React.useRef<EditorView | null>(null);
  const langCompartment = React.useRef(new Compartment());
  const initialConfigRef = React.useRef(langConfig);

  // Built once — a stable array identity means CodeMirror never does a full
  // reconfigure from prop changes; schema updates flow through the compartment.
  const extensions = React.useMemo(
    () => [
      langCompartment.current.of(buildSqlExtension(initialConfigRef.current)),
      EditorView.lineWrapping,
    ],
    [],
  );

  const handleCreateEditor = React.useCallback(
    (view: EditorView) => {
      viewRef.current = view;
      onCreateEditor(view);
    },
    [onCreateEditor],
  );

  // Push dialect/schema changes into the live editor without rebuilding it.
  React.useEffect(() => {
    if (langConfig === initialConfigRef.current) return; // no-op on first mount
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: langCompartment.current.reconfigure(buildSqlExtension(langConfig)),
    });
  }, [langConfig]);

  return (
    <CodeMirror
      value={value}
      onCreateEditor={handleCreateEditor}
      onChange={onChange}
      extensions={extensions}
      theme={oneDark}
      height="100%"
      placeholder={placeholder}
      style={EDITOR_STYLE}
      basicSetup={BASIC_SETUP}
    />
  );
}

export const SqlEditor = React.memo(SqlEditorComponent);
