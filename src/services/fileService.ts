import { open, save } from "@tauri-apps/plugin-dialog";
import { invokeCommand } from "./tauriService";

const SQL_FILTER = [{ name: "SQL", extensions: ["sql"] }];

/** Prompt for a `.sql` file and return its path + contents (null if cancelled). */
export async function openSqlFile(): Promise<{ path: string; content: string } | null> {
  const selected = await open({ multiple: false, filters: SQL_FILTER });
  if (typeof selected !== "string") return null;
  const content = await invokeCommand<string>("read_text_file", { path: selected });
  return { path: selected, content };
}

/** Prompt for a destination and write SQL to it. Returns the path (null if cancelled). */
export async function saveSqlFile(content: string, defaultName = "query.sql"): Promise<string | null> {
  const path = await save({ defaultPath: defaultName, filters: SQL_FILTER });
  if (!path) return null;
  await invokeCommand<void>("write_text_file", { path, contents: content });
  return path;
}

/** Stage the bundled sample SQLite database and return a path to open. */
export function prepareSampleDatabase(): Promise<string> {
  return invokeCommand<string>("prepare_sample_database");
}
