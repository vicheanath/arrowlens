import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AiConfigDto, AiConfigUpdate } from "../models/ai";
import * as aiService from "../services/aiService";
import { useToast } from "../utils/toast";
import { errorToMessage } from "../utils/errors";

interface AiState {
  config: AiConfigDto | null;
  isLoading: boolean;
  reloadConfig: () => Promise<void>;
  updateConfig: (update: AiConfigUpdate) => Promise<AiConfigDto | null>;
}

const AiContext = createContext<AiState | null>(null);

export function AiProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AiConfigDto | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { error: showError } = useToast();

  const reloadConfig = useCallback(async () => {
    setIsLoading(true);
    try {
      const next = await aiService.getAiConfig();
      setConfig(next);
    } catch (e) {
      showError(errorToMessage(e), "Failed to load AI settings");
    } finally {
      setIsLoading(false);
    }
  }, [showError]);

  const updateConfig = useCallback(
    async (update: AiConfigUpdate) => {
      try {
        const next = await aiService.updateAiConfig(update);
        setConfig(next);
        return next;
      } catch (e) {
        showError(errorToMessage(e), "Failed to save AI settings");
        return null;
      }
    },
    [showError],
  );

  useEffect(() => {
    void reloadConfig();
  }, [reloadConfig]);

  const value = useMemo(
    () => ({ config, isLoading, reloadConfig, updateConfig }),
    [config, isLoading, reloadConfig, updateConfig],
  );

  return React.createElement(AiContext.Provider, { value }, children);
}

export function useAiStore(): AiState {
  const value = useContext(AiContext);
  if (!value) {
    throw new Error("useAiStore must be used within AiProvider");
  }
  return value;
}
