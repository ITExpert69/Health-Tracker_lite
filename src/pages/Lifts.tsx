import { useEffect, useMemo, useState } from "react";
import { useApp, useQuery } from "../AppContext";
import {
  createExercise,
  deleteWorkout,
  exerciseHistory,
  getWorkout,
  listExercises,
  listWorkouts,
  saveWorkout,
  usedExercises,
  type Exercise,
  type WorkoutSetInput,
} from "../db/repo";
import { Button, Card, Empty, Field, Input, PageHeader, Select, StatTile, Table, num } from "../components/ui";
import { Chart, axisStyle, baseOption, useChartTheme } from "../components/Chart";
import { formatDate, fromDateTimeLocal, localDate, localTz, toDateTimeLocal, weekStart } from "../lib/dates";
import { displayToKg, kgToDisplay, massUnit } from "../lib/units";
import { epley1RM } from "../lib/stats";

interface DraftSet {
  key: number;
  exercise_id: number;
  reps: string;
  weight: string;
  rpe: string;
  set_type: string;
}

let keySeq = 1;

export default function Lifts() {
  const { db, settings, changed } = useApp();
  const u = settings.units;
  const workouts = useQuery((d) => listWorkouts(d));
  const [editing, setEditing] = useState<number | "new" | null>(null);

  const thisWeek = weekStart(localDate());
  const weekly = (workouts ?? []).filter((w) => localDate(new Date(w.start_utc)) >= thisWeek);

  return (
    <>
      <PageHeader
        title="Lifts"
        subtitle="Volume counts working sets only (reps × load)."
        actions={
          editing == null && (
            <Button variant="primary" onClick={() => setEditing("new")}>
              New workout
            </Button>
          )
        }
      />

      {editing != null && (
        <WorkoutEditor
          id={editing === "new" ? undefined : editing}
          onDone={() => {
            setEditing(null);
            changed();
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Sessions this week" value={weekly.length} />
        <StatTile label="Volume this week" value={Math.round(kgToDisplay(weekly.reduce((a, w) => a + w.volume_kg, 0), u)).toLocaleString()} unit={massUnit(u)} />
        <StatTile label="Sets this week" value={weekly.reduce((a, w) => a + w.set_count, 0)} />
        <StatTile label="All-time sessions" value={workouts?.length ?? "–"} />
      </div>

      <ExerciseProgress />

      <Card title="Workouts" className="mt-4">
        {workouts?.length ? (
          <Table head={["Date", "Name", "Exercises", "Sets", `Volume (${massUnit(u)})`, ""]}>
            {workouts.map((w) => (
              <tr key={w.id}>
                <td className="whitespace-nowrap px-2 py-1.5">{formatDate(w.start_utc, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</td>
                <td className="px-2 py-1.5">{w.name ?? "–"}</td>
                <td className="px-2 py-1.5 text-ink-2">{w.exercises ?? "–"}</td>
                <td className="px-2 py-1.5">{w.set_count}</td>
                <td className="px-2 py-1.5">{Math.round(kgToDisplay(w.volume_kg, u)).toLocaleString()}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right">
                  <Button variant="ghost" onClick={() => setEditing(w.id)}>
                    Edit
                  </Button>
                  <Button
                    variant="danger"
                    onClick={async () => {
                      if (!confirm("Delete this workout?")) return;
                      await deleteWorkout(db, w.id);
                      changed();
                    }}
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>No workouts yet. Use “New workout” to log one.</Empty>
        )}
      </Card>
    </>
  );
}

function WorkoutEditor({ id, onDone, onCancel }: { id?: number; onDone: () => void; onCancel: () => void }) {
  const { db, settings } = useApp();
  const u = settings.units;
  const exercises = useQuery(listExercises) ?? [];
  const [loaded, setLoaded] = useState(!id);
  const [when, setWhen] = useState(() => toDateTimeLocal(new Date().toISOString()));
  const [name, setName] = useState("");
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");
  const [sets, setSets] = useState<DraftSet[]>([]);
  const [pick, setPick] = useState<number | "">("");
  const [newEx, setNewEx] = useState("");
  const [tz, setTz] = useState(localTz());

  useEffect(() => {
    if (!id) return;
    let live = true;
    void getWorkout(db, id).then((w) => {
      if (!live) return;
      if (w) {
        setWhen(toDateTimeLocal(w.workout.start_utc));
        setName(w.workout.name ?? "");
        setDuration(w.workout.duration_s ? String(Math.round(w.workout.duration_s / 60)) : "");
        setNotes(w.workout.notes ?? "");
        setTz(w.workout.tz);
        setSets(
          w.sets.map((s) => ({
            key: keySeq++,
            exercise_id: s.exercise_id,
            reps: s.reps == null ? "" : String(s.reps),
            weight: s.weight_kg == null ? "" : String(Number(kgToDisplay(s.weight_kg, u).toFixed(2))),
            rpe: s.rpe == null ? "" : String(s.rpe),
            set_type: s.set_type,
          })),
        );
      }
      setLoaded(true);
    });
    return () => {
      live = false;
    };
  }, [db, id, u]);

  // Group sets by exercise, preserving first-appearance order.
  const groups = useMemo(() => {
    const order: number[] = [];
    for (const s of sets) if (!order.includes(s.exercise_id)) order.push(s.exercise_id);
    return order.map((exId) => ({ exId, sets: sets.filter((s) => s.exercise_id === exId) }));
  }, [sets]);

  const exName = (exId: number) => exercises.find((e) => e.id === exId)?.name ?? "?";

  function addSet(exId: number) {
    const prev = [...sets].reverse().find((s) => s.exercise_id === exId);
    const next: DraftSet = prev ? { ...prev, key: keySeq++, set_type: prev.set_type === "warmup" ? "working" : prev.set_type } : { key: keySeq++, exercise_id: exId, reps: "", weight: "", rpe: "", set_type: "working" };
    // insert after the last set of this exercise
    const lastIdx = sets.map((s) => s.exercise_id).lastIndexOf(exId);
    const copy = [...sets];
    copy.splice(lastIdx + 1, 0, next);
    setSets(lastIdx === -1 ? [...sets, next] : copy);
  }

  async function addExercise() {
    let exId = pick || 0;
    if (!exId && newEx.trim()) {
      const existing = exercises.find((e) => e.name.toLowerCase() === newEx.trim().toLowerCase());
      exId = existing ? existing.id : await createExercise(db, newEx.trim(), "other");
    }
    if (!exId) return;
    addSet(exId);
    setPick("");
    setNewEx("");
  }

  const update = (key: number, patch: Partial<DraftSet>) => setSets(sets.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  async function save() {
    const payload: WorkoutSetInput[] = sets
      .filter((s) => num(s.reps) != null || num(s.weight) != null)
      .map((s) => {
        const w = num(s.weight);
        return { exercise_id: s.exercise_id, reps: num(s.reps), weight_kg: w == null ? null : displayToKg(w, u), rpe: num(s.rpe), set_type: s.set_type };
      });
    const mins = num(duration);
    await saveWorkout(db, { start_utc: fromDateTimeLocal(when), tz, duration_s: mins == null ? null : mins * 60, name: name.trim() || null, notes: notes.trim() || null }, payload, id);
    onDone();
  }

  if (!loaded) return null;

  return (
    <Card title={id ? "Edit workout" : "New workout"} className="mb-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field label="Start">
          <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Upper A" />
        </Field>
        <Field label="Duration (min)">
          <Input type="number" min="0" value={duration} onChange={(e) => setDuration(e.target.value)} />
        </Field>
        <Field label="Notes">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>

      <div className="mt-4 space-y-4">
        {groups.map((g) => (
          <div key={g.exId} className="rounded-lg border border-line p-3">
            <div className="mb-2 font-medium">{exName(g.exId)}</div>
            <div className="grid grid-cols-[2.5rem_1fr_1fr_1fr_1fr_auto] items-center gap-2 text-xs text-muted">
              <span>Set</span>
              <span>Type</span>
              <span>Reps</span>
              <span>Weight ({massUnit(u)})</span>
              <span>RPE</span>
              <span />
              {g.sets.map((s, i) => (
                <SetRow key={s.key} n={i + 1} s={s} onChange={(p) => update(s.key, p)} onRemove={() => setSets(sets.filter((x) => x.key !== s.key))} />
              ))}
            </div>
            <Button variant="ghost" className="mt-2" onClick={() => addSet(g.exId)}>
              + Add set
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <Field label="Add exercise" className="w-60">
          <Select value={pick} onChange={(e) => setPick(Number(e.target.value) || "")}>
            <option value="">Choose…</option>
            {exercises.map((e: Exercise) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
        </Field>
        <span className="pb-2 text-xs text-muted">or</span>
        <Field label="New exercise" className="w-52">
          <Input value={newEx} onChange={(e) => setNewEx(e.target.value)} placeholder="Name" />
        </Field>
        <Button onClick={() => void addExercise()} disabled={!pick && !newEx.trim()}>
          Add
        </Button>
      </div>

      <div className="mt-5 flex gap-2 border-t border-line pt-4">
        <Button variant="primary" onClick={() => void save()}>
          Save workout
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

function SetRow({ n, s, onChange, onRemove }: { n: number; s: DraftSet; onChange: (p: Partial<DraftSet>) => void; onRemove: () => void }) {
  return (
    <>
      <span className="tabular text-sm text-ink-2">{n}</span>
      <Select value={s.set_type} onChange={(e) => onChange({ set_type: e.target.value })} aria-label="Set type">
        <option value="working">Working</option>
        <option value="warmup">Warm-up</option>
        <option value="drop">Drop</option>
        <option value="failure">Failure</option>
      </Select>
      <Input type="number" min="0" value={s.reps} onChange={(e) => onChange({ reps: e.target.value })} aria-label="Reps" />
      <Input type="number" min="0" step="0.25" value={s.weight} onChange={(e) => onChange({ weight: e.target.value })} aria-label="Weight" />
      <Input type="number" min="1" max="10" step="0.5" value={s.rpe} onChange={(e) => onChange({ rpe: e.target.value })} aria-label="RPE" />
      <Button variant="ghost" onClick={onRemove} aria-label="Remove set">
        ✕
      </Button>
    </>
  );
}

function ExerciseProgress() {
  const { settings } = useApp();
  const u = settings.units;
  const t = useChartTheme();
  const used = useQuery(usedExercises) ?? [];
  const [chosen, setChosen] = useState<number | "">("");
  const exId = chosen || used[0]?.id;
  const history = useQuery((d) => (exId ? exerciseHistory(d, exId) : Promise.resolve([])), [exId]) ?? [];

  const sessions = useMemo(() => {
    const m = new Map<number, { date: string; best: number; top: number }>();
    for (const s of history) {
      if (s.set_type === "warmup" || !s.reps || !s.weight_kg) continue;
      const e = m.get(s.workout_id) ?? { date: localDate(new Date(s.start_utc)), best: 0, top: 0 };
      e.best = Math.max(e.best, epley1RM(s.weight_kg, s.reps));
      e.top = Math.max(e.top, s.weight_kg);
      m.set(s.workout_id, e);
    }
    return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [history]);

  // Rep-max board: heaviest load lifted for at least N reps.
  const prs = useMemo(
    () =>
      [1, 3, 5, 8, 10].map((r) => {
        let best: { w: number; date: string } | null = null;
        for (const s of history) {
          if (s.set_type === "warmup" || !s.weight_kg || (s.reps ?? 0) < r) continue;
          if (!best || s.weight_kg > best.w) best = { w: s.weight_kg, date: s.start_utc };
        }
        return { reps: r, best };
      }),
    [history],
  );

  if (!used.length) return null;
  const conv = (kg: number) => Number(kgToDisplay(kg, u).toFixed(1));
  const unit = massUnit(u);
  const bestE1rm = sessions.reduce((a, s) => Math.max(a, s.best), 0);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card
        title="Estimated 1RM per session"
        className="lg:col-span-2"
        actions={
          <Select value={exId ?? ""} onChange={(e) => setChosen(Number(e.target.value) || "")} className="w-48">
            {used.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
        }
      >
        {sessions.length ? (
          <Chart
            height={260}
            option={{
              ...baseOption(t),
              legend: { show: false },
              tooltip: { ...(baseOption(t).tooltip as object), trigger: "axis", valueFormatter: (v) => `${v} ${unit}` },
              xAxis: { type: "time", ...axisStyle(t), splitLine: { show: false } },
              yAxis: { type: "value", scale: true, ...axisStyle(t), axisLabel: { color: t.muted, fontSize: 11, formatter: `{value} ${unit}` } },
              series: [
                {
                  name: "Estimated 1RM",
                  type: "line",
                  symbol: "circle",
                  symbolSize: 8,
                  lineStyle: { width: 2, color: t.series[0] },
                  itemStyle: { color: t.series[0], borderColor: t.surface, borderWidth: 2 },
                  data: sessions.map((s) => [s.date, conv(s.best)]),
                },
              ],
            }}
          />
        ) : (
          <Empty>No working sets with reps and load for this exercise.</Empty>
        )}
      </Card>
      <Card title="Personal records">
        <div className="mb-3 text-sm">
          Best estimated 1RM: <span className="font-semibold">{bestE1rm ? `${conv(bestE1rm)} ${unit}` : "–"}</span>
        </div>
        <Table head={["Reps", `Load (${unit})`, "Date"]}>
          {prs.map((p) => (
            <tr key={p.reps}>
              <td className="px-2 py-1.5">{p.reps}RM</td>
              <td className="px-2 py-1.5">{p.best ? conv(p.best.w) : "–"}</td>
              <td className="px-2 py-1.5 text-ink-2">{p.best ? formatDate(p.best.date) : ""}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
