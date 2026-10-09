export type SqlValue = string | number | null;

export interface ExecResult {
  lastInsertId: number;
  rowsAffected: number;
}

/**
 * Minimal database contract shared by the Tauri SQLite backend and the
 * sql.js backend (browser dev mode and tests). Placeholders are `?`.
 */
export interface Db {
  execute(sql: string, params?: SqlValue[]): Promise<ExecResult>;
  select<T = Record<string, unknown>>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** Flush pending writes to durable storage (no-op where writes are already durable). */
  flush?(): Promise<void>;
}
