import { invoke } from "@tauri-apps/api/core";

/**
 * Typed wrapper around Tauri's invoke for all backend commands.
 */
export async function invokeCommand<T>(
  command: string,
  args?: Record<string, unknown>
): Promise<T> {
  return invoke<T>(command, args);
}
