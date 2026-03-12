import { create } from "zustand";
import { persist } from "zustand/middleware";

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

export const useDebugStore = create<DebugState>()(
  persist(
    (set) => ({
      debugMode: false,
      lastError: null,

      setDebugMode: (value) => set({ debugMode: value }),
      toggleDebugMode: () => set((state) => ({ debugMode: !state.debugMode })),
      recordError: (entry) => set({ lastError: entry }),
      clearLastError: () => set({ lastError: null }),
    }),
    {
      name: "arrowlens-debug-store",
      partialize: (state) => ({ debugMode: state.debugMode }),
    },
  ),
);