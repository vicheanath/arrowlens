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

interface DebugModeState {
  debugMode: boolean;
  setDebugMode: (value: boolean) => void;
  toggleDebugMode: () => void;
}

interface DebugErrorState {
  lastError: DebugErrorEntry | null;
  recordError: (entry: DebugErrorEntry) => void;
  clearLastError: () => void;
}

const DebugModeContext = createContext<DebugModeState | null>(null);
const DebugErrorContext = createContext<DebugErrorState | null>(null);

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

  const modeValue = useMemo(
    () => ({
      debugMode,
      setDebugMode,
      toggleDebugMode: () => setDebugMode((current) => !current),
    }),
    [debugMode, setDebugMode],
  );

  const errorValue = useMemo(
    () => ({
      lastError,
      recordError: (entry: DebugErrorEntry) => setLastError(entry),
      clearLastError: () => setLastError(null),
    }),
    [lastError],
  );

  return React.createElement(
    DebugModeContext.Provider,
    { value: modeValue },
    React.createElement(DebugErrorContext.Provider, { value: errorValue }, children),
  );
}

function useRequiredDebugContext<T>(context: React.Context<T | null>, name: string): T {
  const value = useContext(context);
  if (!value) {
    throw new Error(`${name} must be used within DebugProvider`);
  }
  return value;
}

export function useDebugModeState() {
  return useRequiredDebugContext(DebugModeContext, "useDebugModeState");
}

export function useDebugErrorState() {
  return useRequiredDebugContext(DebugErrorContext, "useDebugErrorState");
}

export function useDebugStore(): DebugState {
  const { debugMode, setDebugMode, toggleDebugMode } = useDebugModeState();
  const { lastError, recordError, clearLastError } = useDebugErrorState();

  return {
    debugMode,
    lastError,
    setDebugMode,
    toggleDebugMode,
    recordError,
    clearLastError,
  };
}