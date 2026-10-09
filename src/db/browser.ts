import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { SqlJsDb, openMemoryDb } from "./sqljs";

// Browser dev mode (npm run dev without Tauri): the database lives in IndexedDB.
const IDB_NAME = "health-tracker";
const KEY = "db";

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("files");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function load(): Promise<Uint8Array | undefined> {
  const store = (await idb()).transaction("files").objectStore("files");
  return new Promise((resolve, reject) => {
    const req = store.get(KEY);
    req.onsuccess = () => resolve(req.result as Uint8Array | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function save(bytes: Uint8Array): Promise<void> {
  const tx = (await idb()).transaction("files", "readwrite");
  tx.objectStore("files").put(bytes, KEY);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Asks the browser not to evict our storage under pressure. Safari grants this
 * to home-screen apps; returns whether storage is persistent.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (await navigator.storage?.persisted?.()) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export async function openBrowserDb(): Promise<SqlJsDb> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const db = new SqlJsDb(openMemoryDb(SQL, await load()), save);
  // iOS may suspend or kill a backgrounded app at any time: write pending changes immediately.
  const flushNow = () => void db.flush();
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flushNow());
  window.addEventListener("pagehide", flushNow);
  void requestPersistence();
  return db;
}
