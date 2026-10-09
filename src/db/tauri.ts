import Database from "@tauri-apps/plugin-sql";
import type { Db, ExecResult, SqlValue } from "./types";

/** SQLite file in the app-data folder, accessed through tauri-plugin-sql. */
export class TauriDb implements Db {
  private constructor(private readonly db: Database) {}

  static async open(file = "health.db"): Promise<TauriDb> {
    const db = await Database.load(`sqlite:${file}`);
    await db.execute("PRAGMA foreign_keys = ON");
    return new TauriDb(db);
  }

  async execute(sql: string, params: SqlValue[] = []): Promise<ExecResult> {
    const r = await this.db.execute(sql, params);
    return { lastInsertId: Number(r.lastInsertId ?? 0), rowsAffected: r.rowsAffected };
  }

  select<T>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    return this.db.select<T[]>(sql, params);
  }
}
