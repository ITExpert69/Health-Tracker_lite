import type { Database, SqlJsStatic } from "sql.js";
import type { Db, ExecResult, SqlValue } from "./types";

/** sql.js-backed Db. `persist` is called (debounced) after writes. */
export class SqlJsDb implements Db {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly db: Database,
    private readonly persist?: (bytes: Uint8Array) => Promise<void>,
  ) {
    db.run("PRAGMA foreign_keys = ON");
  }

  async execute(sql: string, params: SqlValue[] = []): Promise<ExecResult> {
    this.db.run(sql, params);
    const rowsAffected = this.db.getRowsModified();
    const r = this.db.exec("SELECT last_insert_rowid()");
    const lastInsertId = Number(r[0]?.values[0]?.[0] ?? 0);
    this.schedulePersist();
    return { lastInsertId, rowsAffected };
  }

  async select<T>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
      const out: T[] = [];
      while (stmt.step()) out.push(stmt.getAsObject() as T);
      return out;
    } finally {
      stmt.free();
    }
  }

  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.persist) await this.persist(this.db.export());
  }

  private schedulePersist() {
    if (!this.persist) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), 300);
  }
}

export function openMemoryDb(SQL: SqlJsStatic, bytes?: Uint8Array): Database {
  return bytes ? new SQL.Database(bytes) : new SQL.Database();
}
