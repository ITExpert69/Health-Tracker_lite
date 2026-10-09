import { useState } from "react";
import { useApp, useQuery } from "../AppContext";
import { clearAllData, listTargets, restoreBackup, setTarget, type Backup } from "../db/repo";
import { Button, Card, Field, Input, PageHeader, Select, Table, num } from "../components/ui";
import { formatDate, localDate } from "../lib/dates";
import { displayToKg, kgToDisplay, massUnit, type UnitSystem } from "../lib/units";
import { macroKcal } from "../lib/stats";
import { openTextFile } from "../lib/backupFile";
import { backupNow } from "../lib/backup";
import { isEmpty, loadDemoData } from "../lib/demo";
import { isTauri } from "../db";

export default function SettingsPage() {
  const { db, settings, updateSettings, changed } = useApp();
  const u = settings.units;
  const targets = useQuery(listTargets) ?? [];
  const empty = useQuery(isEmpty);
  const current = targets[0];
  const [goal, setGoal] = useState(settings.weightGoalKg ? String(Number(kgToDisplay(settings.weightGoalKg, u).toFixed(1))) : "");
  const [t, setT] = useState({
    from: localDate(),
    kcal: current ? String(current.kcal) : "",
    protein: current ? String(current.protein_g) : "",
    carbs: current ? String(current.carbs_g) : "",
    fat: current ? String(current.fat_g) : "",
  });
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const persisted = useQuery(async () => (isTauri() ? true : (await import("../db/browser")).requestPersistence()));

  async function saveTarget() {
    const p = num(t.protein) ?? 0;
    const c = num(t.carbs) ?? 0;
    const f = num(t.fat) ?? 0;
    const kcal = num(t.kcal) ?? macroKcal(p, c, f);
    if (!kcal) return;
    await setTarget(db, { valid_from: t.from, kcal, protein_g: p, carbs_g: c, fat_g: f });
    changed();
    setStatus("Nutrition target saved.");
  }

  async function doExport() {
    if (await backupNow(db)) {
      await updateSettings({});
      setStatus("Backup exported.");
    }
  }

  async function doRestore() {
    const text = await openTextFile();
    if (!text) return;
    if (!confirm("Restoring replaces ALL current data with the backup. Continue?")) return;
    setBusy(true);
    try {
      const n = await restoreBackup(db, JSON.parse(text) as Backup);
      changed();
      setStatus(`Restored ${n.toLocaleString()} records.`);
    } catch (e) {
      setStatus(`Restore failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function doDemo() {
    setBusy(true);
    await loadDemoData(db);
    setBusy(false);
    changed();
    setStatus("Demo data loaded: 120 days of weight, food, lifts, runs, rides and swims.");
  }

  return (
    <>
      <PageHeader title="Settings & data" />
      {status && <div className="mb-4 rounded-lg border border-line bg-surface px-3 py-2 text-sm">{status}</div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Units & goals">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Units">
              <Select
                value={u}
                onChange={(e) => {
                  const next = e.target.value as UnitSystem;
                  void updateSettings({ units: next });
                  if (settings.weightGoalKg) setGoal(String(Number(kgToDisplay(settings.weightGoalKg, next).toFixed(1))));
                }}
              >
                <option value="metric">Metric (kg, km)</option>
                <option value="imperial">Imperial (lb, mi)</option>
              </Select>
            </Field>
            <Field label={`Goal weight (${massUnit(u)})`}>
              <div className="flex gap-2">
                <Input type="number" step="0.1" min="0" value={goal} onChange={(e) => setGoal(e.target.value)} />
                <Button
                  onClick={() => {
                    const g = num(goal);
                    void updateSettings({ weightGoalKg: g == null ? null : displayToKg(g, u) });
                    setStatus("Goal saved.");
                  }}
                >
                  Save
                </Button>
              </div>
            </Field>
          </div>
        </Card>

        <Card title="Nutrition targets">
          <form
            className="grid grid-cols-2 gap-3 sm:grid-cols-5"
            onSubmit={(e) => {
              e.preventDefault();
              void saveTarget();
            }}
          >
            <Field label="Valid from" className="col-span-2 sm:col-span-5">
              <Input type="date" value={t.from} onChange={(e) => setT({ ...t, from: e.target.value })} required className="max-w-[12rem]" />
            </Field>
            <Field label="kcal">
              <Input type="number" min="0" value={t.kcal} onChange={(e) => setT({ ...t, kcal: e.target.value })} placeholder="auto" />
            </Field>
            <Field label="Protein g">
              <Input type="number" min="0" value={t.protein} onChange={(e) => setT({ ...t, protein: e.target.value })} />
            </Field>
            <Field label="Carbs g">
              <Input type="number" min="0" value={t.carbs} onChange={(e) => setT({ ...t, carbs: e.target.value })} />
            </Field>
            <Field label="Fat g">
              <Input type="number" min="0" value={t.fat} onChange={(e) => setT({ ...t, fat: e.target.value })} />
            </Field>
            <div className="flex items-end">
              <Button type="submit" variant="primary">
                Save
              </Button>
            </div>
          </form>
          <p className="mt-2 text-xs text-muted">Targets are kept as history: past days are judged against the target in force at the time.</p>
          {targets.length > 0 && (
            <div className="mt-3">
              <Table head={["From", "kcal", "Protein", "Carbs", "Fat"]}>
                {targets.map((x) => (
                  <tr key={x.valid_from}>
                    <td className="px-2 py-1.5">{formatDate(x.valid_from)}</td>
                    <td className="px-2 py-1.5">{Math.round(x.kcal)}</td>
                    <td className="px-2 py-1.5">{x.protein_g} g</td>
                    <td className="px-2 py-1.5">{x.carbs_g} g</td>
                    <td className="px-2 py-1.5">{x.fat_g} g</td>
                  </tr>
                ))}
              </Table>
            </div>
          )}
        </Card>

        <Card title="Backup & restore">
          <p className="mb-3 text-sm text-ink-2">
            {isTauri()
              ? "Your data lives in a single SQLite file (health.db) in the app-data folder. Export a JSON backup any time; it contains everything."
              : "Your data is stored in this browser on this device. It is not synced anywhere. Export a backup regularly and keep it in Files or iCloud Drive; restoring it on another device moves all your data there."}
          </p>
          {!isTauri() && (
            <p className="mb-3 text-xs text-muted">
              Last backup: {settings.lastBackupAt ? formatDate(settings.lastBackupAt, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "never"}
              {" · "}Storage: {persisted == null ? "checking…" : persisted ? "persistent (protected from automatic clean-up)" : "best-effort; add the app to your Home Screen to protect it"}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void doExport()}>Export backup (JSON)</Button>
            <Button onClick={() => void doRestore()} disabled={busy}>
              Restore from backup…
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (!confirm("Delete ALL weigh-ins, food logs, foods, targets, workouts and activities? Export a backup first if unsure.")) return;
                await clearAllData(db);
                changed();
                setStatus("All data deleted.");
              }}
            >
              Delete all data
            </Button>
          </div>
        </Card>

        <Card title="Import history">
          <p className="text-sm text-ink-2">
            Garmin/Strava exports and FIT, GPX and TCX files arrive in phase 2. Strong, Hevy, nutrition-app CSVs and a spreadsheet mapper arrive in phase 3. Until
            then, all records can be entered by hand.
          </p>
          {empty && (
            <div className="mt-3 border-t border-line pt-3">
              <p className="mb-2 text-sm text-ink-2">Your database is empty. Want to look around with sample data first? You can remove it again with “Delete all data”.</p>
              <Button onClick={() => void doDemo()} disabled={busy}>
                {busy ? "Loading…" : "Load demo data"}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
