import initSqlJs from "sql.js";
import { SqlJsDb, openMemoryDb } from "../src/db/sqljs";
import { migrate } from "../src/db/migrations";

export async function freshDb() {
  const SQL = await initSqlJs();
  const db = new SqlJsDb(openMemoryDb(SQL));
  await migrate(db);
  return db;
}
