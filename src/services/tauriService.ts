import { invoke } from "@tauri-apps/api/core";

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
    // Handle Tauri error responses
    if (error instanceof Error) {
      try {
        // Try to parse as structured ErrorResponse
        const errorObj = JSON.parse(error.message) as ErrorResponse;
        throw new AppCommandError(errorObj.message, errorObj.code, errorObj.suggestion);
      } catch (parseErr) {
        // Fall back to regular error
        throw new AppCommandError(error.message, "UNKNOWN_ERROR");
      }
    }
    throw error;
  }
}

export class AppCommandError extends Error {
  constructor(
    message: string,
    public code: string,
    public suggestion?: string
  ) {
    super(message);
    this.name = "AppCommandError";
    Object.setPrototypeOf(this, AppCommandError.prototype);
  }
}
