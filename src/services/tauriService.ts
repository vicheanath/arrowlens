import { invoke } from "@tauri-apps/api/core";
import { useDebugStore } from "../state/debugStore";

export interface ErrorResponse {
  code: string;
  message: string;
  context?: string;
  suggestion?: string;
}

/**
 * Typed wrapper around Tauri's invoke for all backend commands.
 */
export async function invokeCommand<T>(
  command: string,
  args?: Record<string, unknown>
): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error: unknown) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const baseLog = {
      command,
      args,
      rawMessage,
      originalError: error,
    };

    if (error instanceof Error) {
      let errorObj: ErrorResponse | null = null;

      try {
        errorObj = JSON.parse(error.message) as ErrorResponse;
      } catch {
        errorObj = null;
      }

      if (errorObj) {
        console.error("[IPC Error] Parsed backend error", {
          ...baseLog,
          parsedError: errorObj,
        });

        const appError = new AppCommandError(
          errorObj.message,
          errorObj.code,
          errorObj.suggestion,
          error.message,
          errorObj.context,
          command,
          args,
          errorObj,
        );
        useDebugStore.getState().recordError({
          timestamp: new Date().toISOString(),
          command,
          args,
          code: appError.code,
          message: appError.message,
          rawMessage: appError.rawMessage,
          context: appError.context,
          suggestion: appError.suggestion,
          parsedPayload: errorObj,
        });
        throw appError;
      }

      console.error("[IPC Error] Unparsed backend error", baseLog);

      const appError = new AppCommandError(
        rawMessage,
        "UNKNOWN_ERROR",
        undefined,
        rawMessage,
        undefined,
        command,
        args,
      );
      useDebugStore.getState().recordError({
        timestamp: new Date().toISOString(),
        command,
        args,
        code: appError.code,
        message: appError.message,
        rawMessage: appError.rawMessage,
      });
      throw appError;
    }

    console.error("[IPC Error] Non-Error rejection", baseLog);

    useDebugStore.getState().recordError({
      timestamp: new Date().toISOString(),
      command,
      args,
      code: "UNKNOWN_ERROR",
      message: rawMessage,
      rawMessage,
    });
    throw error;
  }
}

export class AppCommandError extends Error {
  constructor(
    message: string,
    public code: string,
    public suggestion?: string,
    public rawMessage: string = message,
    public context?: string,
    public command?: string,
    public args?: Record<string, unknown>,
    public parsedPayload?: unknown,
  ) {
    super(message);
    this.name = "AppCommandError";
    Object.setPrototypeOf(this, AppCommandError.prototype);
  }
}
