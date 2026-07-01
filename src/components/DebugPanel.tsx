import React from "react";
import { Bug, Trash2, X } from "lucide-react";
import { useDebugErrorState, useDebugModeState } from "../state/debugStore";

export function DebugPanel() {
  const { debugMode, setDebugMode } = useDebugModeState();
  const { lastError, clearLastError } = useDebugErrorState();

  if (!debugMode) {
    return null;
  }

  return (
    <div className="fixed left-4 bottom-10 z-50 w-[420px] max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card shadow-panel">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Bug size={14} className="text-accent-peach" />
        <span className="text-sm font-medium text-foreground">Debug Mode</span>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-accent-peach">enabled</span>
        <button
          type="button"
          onClick={clearLastError}
          className="rounded text-muted-foreground hover:text-foreground focus-visible:outline-1 focus-visible:outline-ring"
          title="Clear last error"
          aria-label="Clear last error"
        >
          <Trash2 size={13} />
        </button>
        <button
          type="button"
          onClick={() => setDebugMode(false)}
          className="rounded text-muted-foreground hover:text-foreground focus-visible:outline-1 focus-visible:outline-ring"
          title="Close debug mode"
          aria-label="Close debug mode"
        >
          <X size={13} />
        </button>
      </div>

      <div className="max-h-[50vh] overflow-auto p-3 text-xs">
        {lastError ? (
          <div className="space-y-3">
            <div>
              <div className="text-muted-foreground">Time</div>
              <div className="font-mono text-foreground/80">{new Date(lastError.timestamp).toLocaleString()}</div>
            </div>

            <div>
              <div className="text-muted-foreground">Command</div>
              <div className="font-mono text-foreground/80 break-all">{lastError.command}</div>
            </div>

            <div>
              <div className="text-muted-foreground">Code</div>
              <div className="font-mono text-destructive break-all">{lastError.code}</div>
            </div>

            <div>
              <div className="text-muted-foreground">Message</div>
              <div className="text-foreground/80 break-words">{lastError.message}</div>
            </div>

            {lastError.context && (
              <div>
                <div className="text-muted-foreground">Context</div>
                <pre className="mt-1 overflow-auto rounded bg-muted p-2 font-mono text-[11px] text-foreground/80 whitespace-pre-wrap">
                  {lastError.context}
                </pre>
              </div>
            )}

            {lastError.suggestion && (
              <div>
                <div className="text-muted-foreground">Suggestion</div>
                <div className="text-foreground/80 break-words">{lastError.suggestion}</div>
              </div>
            )}

            {lastError.args && (
              <div>
                <div className="text-muted-foreground">Args</div>
                <pre className="mt-1 overflow-auto rounded bg-muted p-2 font-mono text-[11px] text-foreground/80 whitespace-pre-wrap">
                  {JSON.stringify(lastError.args, null, 2)}
                </pre>
              </div>
            )}

            <div>
              <div className="text-muted-foreground">Raw Message</div>
              <pre className="mt-1 overflow-auto rounded bg-muted p-2 font-mono text-[11px] text-foreground/80 whitespace-pre-wrap break-words">
                {lastError.rawMessage}
              </pre>
            </div>

            {lastError.parsedPayload !== undefined && (
              <div>
                <div className="text-muted-foreground">Parsed Payload</div>
                <pre className="mt-1 overflow-auto rounded bg-muted p-2 font-mono text-[11px] text-foreground/80 whitespace-pre-wrap">
                  {JSON.stringify(lastError.parsedPayload, null, 2)}
                </pre>
              </div>
            )}
          </div>
        ) : (
          <div className="text-muted-foreground">No captured command errors yet.</div>
        )}
      </div>
    </div>
  );
}