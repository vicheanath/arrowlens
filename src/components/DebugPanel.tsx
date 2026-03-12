import React from "react";
import { Bug, Trash2, X } from "lucide-react";
import { useDebugStore } from "../state/debugStore";

export function DebugPanel() {
  const { debugMode, lastError, clearLastError, setDebugMode } = useDebugStore();

  if (!debugMode) {
    return null;
  }

  return (
    <div className="fixed left-4 bottom-10 z-50 w-[420px] max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-surface-1 shadow-panel">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Bug size={14} className="text-accent-peach" />
        <span className="text-sm font-medium text-text-primary">Debug Mode</span>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-accent-peach">enabled</span>
        <button
          onClick={clearLastError}
          className="text-text-muted hover:text-text-primary"
          title="Clear last error"
        >
          <Trash2 size={13} />
        </button>
        <button
          onClick={() => setDebugMode(false)}
          className="text-text-muted hover:text-text-primary"
          title="Close debug mode"
        >
          <X size={13} />
        </button>
      </div>

      <div className="max-h-[50vh] overflow-auto p-3 text-xs">
        {lastError ? (
          <div className="space-y-3">
            <div>
              <div className="text-text-muted">Time</div>
              <div className="font-mono text-text-secondary">{new Date(lastError.timestamp).toLocaleString()}</div>
            </div>

            <div>
              <div className="text-text-muted">Command</div>
              <div className="font-mono text-text-secondary break-all">{lastError.command}</div>
            </div>

            <div>
              <div className="text-text-muted">Code</div>
              <div className="font-mono text-accent-red break-all">{lastError.code}</div>
            </div>

            <div>
              <div className="text-text-muted">Message</div>
              <div className="text-text-secondary break-words">{lastError.message}</div>
            </div>

            {lastError.context && (
              <div>
                <div className="text-text-muted">Context</div>
                <pre className="mt-1 overflow-auto rounded bg-surface-3 p-2 font-mono text-[11px] text-text-secondary whitespace-pre-wrap">
                  {lastError.context}
                </pre>
              </div>
            )}

            {lastError.suggestion && (
              <div>
                <div className="text-text-muted">Suggestion</div>
                <div className="text-text-secondary break-words">{lastError.suggestion}</div>
              </div>
            )}

            {lastError.args && (
              <div>
                <div className="text-text-muted">Args</div>
                <pre className="mt-1 overflow-auto rounded bg-surface-3 p-2 font-mono text-[11px] text-text-secondary whitespace-pre-wrap">
                  {JSON.stringify(lastError.args, null, 2)}
                </pre>
              </div>
            )}

            <div>
              <div className="text-text-muted">Raw Message</div>
              <pre className="mt-1 overflow-auto rounded bg-surface-3 p-2 font-mono text-[11px] text-text-secondary whitespace-pre-wrap break-words">
                {lastError.rawMessage}
              </pre>
            </div>

            {lastError.parsedPayload !== undefined && (
              <div>
                <div className="text-text-muted">Parsed Payload</div>
                <pre className="mt-1 overflow-auto rounded bg-surface-3 p-2 font-mono text-[11px] text-text-secondary whitespace-pre-wrap">
                  {JSON.stringify(lastError.parsedPayload, null, 2)}
                </pre>
              </div>
            )}
          </div>
        ) : (
          <div className="text-text-muted">No captured command errors yet.</div>
        )}
      </div>
    </div>
  );
}