import { migrate } from "./migrations";
import type { Db } from "./types";

export const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

let dbPromise: Promise<Db> | null = null;

/** Opens (once) the right backend for this runtime and applies migrations. */
export function getDb(): Promise<Db> {
  dbPromise ??= (async () => {
    const db: Db = isTauri()
      ? await (await import("./tauri")).TauriDb.open()
      : await (await import("./browser")).openBrowserDb();
    await migrate(db);
    return db;
  })();
  return dbPromise;
}
