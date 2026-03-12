import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePersistentState } from "../hooks/usePersistentState";

export interface DebugErrorEntry {
  timestamp: string;
  command: string;
  args?: Record<string, unknown>;
  code: string;
  message: string;
  rawMessage: string;
  context?: string;
  suggestion?: string;
  parsedPayload?: unknown;
}

interface DebugState {
  debugMode: boolean;
  lastError: DebugErrorEntry | null;
  setDebugMode: (value: boolean) => void;
  toggleDebugMode: () => void;
  recordError: (entry: DebugErrorEntry) => void;
  clearLastError: () => void;
}

const DebugContext = createContext<DebugState | null>(null);

let debugRecorder: ((entry: DebugErrorEntry) => void) | null = null;

export function recordDebugError(entry: DebugErrorEntry) {
  debugRecorder?.(entry);
}

export function DebugProvider({ children }: { children: React.ReactNode }) {
  const [debugMode, setDebugMode] = usePersistentState<boolean>("arrowlens-debug-mode", false);
  const [lastError, setLastError] = useState<DebugErrorEntry | null>(null);

  useEffect(() => {
    debugRecorder = (entry) => setLastError(entry);
    return () => {
      if (debugRecorder) {
        debugRecorder = null;
      }
    };
  }, []);

  const value = useMemo(
    () => ({
      debugMode,
      lastError,
      setDebugMode,
      toggleDebugMode: () => setDebugMode((current) => !current),
      recordError: (entry: DebugErrorEntry) => setLastError(entry),
      clearLastError: () => setLastError(null),
    }),
    [debugMode, lastError, setDebugMode],
  );

  return React.createElement(DebugContext.Provider, { value }, children);
}

export function useDebugStore() {
  const context = useContext(DebugContext);
  if (!context) {
    throw new Error("useDebugStore must be used within DebugProvider");
  }
  return context;
}