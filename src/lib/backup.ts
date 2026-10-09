import type { Db } from "../db/types";
import { exportBackup, saveSettings } from "../db/repo";
import { localDate } from "./dates";
import { saveTextFile } from "./backupFile";

/** Exports a full backup and records when it happened. Returns false if cancelled. */
export async function backupNow(db: Db): Promise<boolean> {
  const b = await exportBackup(db);
  const ok = await saveTextFile(`health-tracker-backup-${localDate()}.json`, JSON.stringify(b));
  if (ok) await saveSettings(db, { lastBackupAt: new Date().toISOString() });
  return ok;
}

export const BACKUP_REMINDER_DAYS = 7;

export function backupOverdue(lastBackupAt: string | null, now = Date.now()): boolean {
  if (!lastBackupAt) return true;
  return now - Date.parse(lastBackupAt) > BACKUP_REMINDER_DAYS * 864e5;
}
