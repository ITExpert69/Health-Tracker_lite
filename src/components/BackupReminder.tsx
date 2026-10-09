import { useState } from "react";
import { useApp, useQuery } from "../AppContext";
import { isTauri } from "../db";
import { isEmpty } from "../lib/demo";
import { backupNow, backupOverdue } from "../lib/backup";
import { formatDate } from "../lib/dates";
import { Button } from "./ui";

/**
 * In the browser/iPad build, data lives in Safari's storage, so a recent
 * backup file is the safety net. Nudge when the last one is over a week old.
 */
export function BackupReminder() {
  const { db, settings, updateSettings, changed } = useApp();
  const empty = useQuery(isEmpty);
  const [snoozed, setSnoozed] = useState(false);
  if (isTauri() || empty !== false || snoozed || !backupOverdue(settings.lastBackupAt)) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm" role="status">
      <span className="min-w-0 flex-1">
        {settings.lastBackupAt ? `Last backup ${formatDate(settings.lastBackupAt)}.` : "You haven't backed up yet."} Your data lives only in this browser; save a backup file to
        Files or iCloud Drive.
      </span>
      <Button
        variant="primary"
        onClick={async () => {
          if (await backupNow(db)) {
            await updateSettings({});
            changed();
          }
        }}
      >
        Back up now
      </Button>
      <Button variant="ghost" onClick={() => setSnoozed(true)}>
        Later
      </Button>
    </div>
  );
}
