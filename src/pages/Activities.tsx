import { useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useApp, useQuery } from "../AppContext";
import { deleteActivity, listActivities, saveActivity, type ActivityRow } from "../db/repo";
import { Button, Card, Empty, Field, Input, PageHeader, Select, StatTile, Table, num } from "../components/ui";
import { Chart, axisStyle, baseOption, useChartTheme } from "../components/Chart";
import { addDays, formatDate, fromDateTimeLocal, localDate, localTz, toDateTimeLocal, weekStart } from "../lib/dates";
import {
  displayDistanceToM,
  distUnit,
  formatDistance,
  formatDuration,
  formatHours,
  formatSpeed,
  mToDisplayDistance,
  parseDuration,
  plural,
  type Sport,
  type UnitSystem,
} from "../lib/units";

export const SPORTS: Record<Sport, { label: string; plural: string; series: 0 | 1 | 2 }> = {
  run: { label: "Run", plural: "Runs", series: 0 },
  ride: { label: "Ride", plural: "Rides", series: 1 },
  swim: { label: "Swim", plural: "Swims", series: 2 },
};

const isSport = (s: string | undefined): s is Sport => !!s && s in SPORTS;

/** Swim distances are entered in metres/yards; others in km/mi. */
function distanceInputUnit(sport: Sport, u: UnitSystem) {
  if (sport === "swim") return u === "metric" ? "m" : "yd";
  return distUnit(u);
}
function inputToMetres(sport: Sport, v: number, u: UnitSystem) {
  if (sport === "swim") return u === "metric" ? v : v * 0.9144;
  return displayDistanceToM(v, u);
}
function metresToInput(sport: Sport, m: number, u: UnitSystem) {
  if (sport === "swim") return u === "metric" ? m : m / 0.9144;
  return mToDisplayDistance(m, u);
}

export default function Activities() {
  const { sport } = useParams();
  if (!isSport(sport)) return <Navigate to="/" replace />;
  return <SportPage key={sport} sport={sport} />;
}

function SportPage({ sport }: { sport: Sport }) {
  const { db, settings, changed } = useApp();
  const u = settings.units;
  const meta = SPORTS[sport];
  const rows = useQuery((d) => listActivities(d, { sport }), [sport]);
  const [editing, setEditing] = useState<ActivityRow | "new" | null>(null);

  const today = localDate();
  const wk = weekStart(today);
  const year = today.slice(0, 4);
  const withDate = (rows ?? []).map((a) => ({ ...a, date: localDate(new Date(a.start_utc)) }));
  const week = withDate.filter((a) => a.date >= wk);
  const ytd = withDate.filter((a) => a.date.startsWith(year));
  const sumDist = (xs: ActivityRow[]) => xs.reduce((s, a) => s + (a.distance_m ?? 0), 0);
  const sumTime = (xs: ActivityRow[]) => xs.reduce((s, a) => s + a.duration_s, 0);

  return (
    <>
      <PageHeader
        title={meta.plural}
        actions={
          editing == null && (
            <Button variant="primary" onClick={() => setEditing("new")}>
              Log {meta.label.toLowerCase()}
            </Button>
          )
        }
      />

      {editing != null && (
        <ActivityForm
          sport={sport}
          initial={editing === "new" ? undefined : editing}
          onDone={() => {
            setEditing(null);
            changed();
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="This week" value={formatDistance(sport, sumDist(week), u)} sub={`${plural(week.length, "session")} · ${formatHours(sumTime(week))}`} />
        <StatTile label={`${year} to date`} value={formatDistance(sport, sumDist(ytd), u)} sub={`${plural(ytd.length, "session")} · ${formatHours(sumTime(ytd))}`} />
        <StatTile label="All time" value={formatDistance(sport, sumDist(withDate), u)} sub={plural(withDate.length, "session")} />
        <StatTile label="Longest" value={withDate.length ? formatDistance(sport, Math.max(...withDate.map((a) => a.distance_m ?? 0)), u) : "–"} />
      </div>

      <Card title="Weekly distance, last 12 weeks">
        <WeeklyDistanceChart sport={sport} rows={withDate} units={u} />
      </Card>

      <Card title="Sessions" className="mt-4">
        {withDate.length ? (
          <Table head={["Date", "Name", "Distance", "Time", sport === "run" ? "Pace" : sport === "ride" ? "Speed" : "Pace", "Avg HR", ""]}>
            {withDate.map((a) => (
              <tr key={a.id}>
                <td className="whitespace-nowrap px-2 py-1.5">{formatDate(a.start_utc, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</td>
                <td className="px-2 py-1.5">
                  {a.name ?? meta.label}
                  {sport === "ride" && a.indoor ? <span className="ml-1 text-xs text-muted">indoor</span> : null}
                  {sport === "swim" && (a.open_water ? <span className="ml-1 text-xs text-muted">open water</span> : a.pool_length_m ? <span className="ml-1 text-xs text-muted">{a.pool_length_m} m pool</span> : null)}
                </td>
                <td className="px-2 py-1.5">{formatDistance(sport, a.distance_m, u)}</td>
                <td className="px-2 py-1.5">{formatDuration(a.duration_s)}</td>
                <td className="px-2 py-1.5">{a.distance_m ? formatSpeed(sport, a.distance_m, a.moving_s ?? a.duration_s, u) : "–"}</td>
                <td className="px-2 py-1.5">{a.avg_hr ? Math.round(a.avg_hr) : "–"}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right">
                  <Button variant="ghost" onClick={() => setEditing(a)}>
                    Edit
                  </Button>
                  <Button
                    variant="danger"
                    onClick={async () => {
                      if (!confirm("Delete this session?")) return;
                      await deleteActivity(db, a.id);
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
          <Empty>No {meta.plural.toLowerCase()} yet. File import (FIT/GPX/TCX, Garmin & Strava exports) arrives in phase 2.</Empty>
        )}
      </Card>
    </>
  );
}

function WeeklyDistanceChart({ sport, rows, units }: { sport: Sport; rows: (ActivityRow & { date: string })[]; units: UnitSystem }) {
  const t = useChartTheme();
  const weeks = useMemo(() => {
    const first = addDays(weekStart(localDate()), -7 * 11);
    const out = Array.from({ length: 12 }, (_, i) => ({ week: addDays(first, 7 * i), m: 0 }));
    for (const a of rows) {
      const w = out.find((x) => x.week === weekStart(a.date));
      if (w) w.m += a.distance_m ?? 0;
    }
    return out;
  }, [rows]);
  const unit = sport === "swim" ? (units === "metric" ? "m" : "yd") : distUnit(units);
  const conv = (m: number) => (sport === "swim" ? Math.round(metresToInput("swim", m, units)) : Number(mToDisplayDistance(m, units).toFixed(1)));
  const color = t.series[SPORTS[sport].series];
  return (
    <Chart
      height={220}
      option={{
        ...baseOption(t),
        legend: { show: false },
        tooltip: { ...(baseOption(t).tooltip as object), trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => `${v} ${unit}` },
        xAxis: {
          type: "category",
          data: weeks.map((w) => w.week),
          ...axisStyle(t),
          splitLine: { show: false },
          axisLabel: { color: t.muted, fontSize: 11, formatter: (d: string) => formatDate(d, { day: "numeric", month: "short" }) },
        },
        yAxis: { type: "value", ...axisStyle(t), axisLabel: { color: t.muted, fontSize: 11, formatter: `{value} ${unit}` } },
        series: [{ name: "Distance", type: "bar", barMaxWidth: 28, itemStyle: { color, borderRadius: [4, 4, 0, 0] }, data: weeks.map((w) => conv(w.m)) }],
      }}
    />
  );
}

function ActivityForm({ sport, initial, onDone, onCancel }: { sport: Sport; initial?: ActivityRow; onDone: () => void; onCancel: () => void }) {
  const { db, settings } = useApp();
  const u = settings.units;
  const s = (v: number | null | undefined, digits = 0) => (v == null ? "" : String(Number(v.toFixed(digits))));
  const [f, setF] = useState({
    when: toDateTimeLocal(initial?.start_utc ?? new Date().toISOString()),
    name: initial?.name ?? "",
    duration: initial ? formatDuration(initial.duration_s) : "",
    distance: initial?.distance_m != null ? s(metresToInput(sport, initial.distance_m, u), sport === "swim" ? 0 : 2) : "",
    elevation: s(initial?.elevation_gain_m),
    avgHr: s(initial?.avg_hr),
    maxHr: s(initial?.max_hr),
    kcal: s(initial?.kcal),
    notes: initial?.notes ?? "",
    power: s(initial?.avg_power_w),
    indoor: !!initial?.indoor,
    pool: initial ? s(initial.pool_length_m) : "25",
    stroke: initial?.stroke ?? "freestyle",
    openWater: !!initial?.open_water,
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value });

  async function save() {
    const duration_s = parseDuration(f.duration);
    if (!Number.isFinite(duration_s) || duration_s <= 0) return setError("Enter a duration like 45:00 or 1:05:30 (or minutes).");
    const d = num(f.distance);
    await saveActivity(
      db,
      {
        sport,
        start_utc: fromDateTimeLocal(f.when),
        tz: initial?.tz ?? localTz(),
        duration_s,
        moving_s: initial?.moving_s ?? null,
        distance_m: d == null ? null : inputToMetres(sport, d, u),
        elevation_gain_m: sport === "swim" ? null : num(f.elevation),
        avg_hr: num(f.avgHr),
        max_hr: num(f.maxHr),
        kcal: num(f.kcal),
        name: f.name.trim() || null,
        notes: f.notes.trim() || null,
      },
      {
        ride: { avg_power_w: num(f.power), indoor: f.indoor ? 1 : 0 },
        swim: { pool_length_m: f.openWater ? null : num(f.pool), stroke: f.stroke, open_water: f.openWater ? 1 : 0 },
      },
      initial?.id,
    );
    onDone();
  }

  return (
    <Card title={initial ? `Edit ${SPORTS[sport].label.toLowerCase()}` : `Log ${SPORTS[sport].label.toLowerCase()}`} className="mb-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label="Start">
            <Input type="datetime-local" value={f.when} onChange={set("when")} required />
          </Field>
          <Field label="Name">
            <Input value={f.name} onChange={set("name")} placeholder={`e.g. Morning ${SPORTS[sport].label.toLowerCase()}`} />
          </Field>
          <Field label="Duration (h:mm:ss)">
            <Input value={f.duration} onChange={set("duration")} placeholder="45:00" required />
          </Field>
          <Field label={`Distance (${distanceInputUnit(sport, u)})`}>
            <Input type="number" min="0" step={sport === "swim" ? "25" : "0.01"} value={f.distance} onChange={set("distance")} />
          </Field>
          {sport !== "swim" && (
            <Field label={`Elevation gain (m)`}>
              <Input type="number" min="0" value={f.elevation} onChange={set("elevation")} />
            </Field>
          )}
          <Field label="Avg HR (bpm)">
            <Input type="number" min="0" value={f.avgHr} onChange={set("avgHr")} />
          </Field>
          <Field label="Max HR (bpm)">
            <Input type="number" min="0" value={f.maxHr} onChange={set("maxHr")} />
          </Field>
          <Field label="Calories (kcal)">
            <Input type="number" min="0" value={f.kcal} onChange={set("kcal")} />
          </Field>
          {sport === "ride" && (
            <>
              <Field label="Avg power (W)">
                <Input type="number" min="0" value={f.power} onChange={set("power")} />
              </Field>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input type="checkbox" checked={f.indoor} onChange={set("indoor")} /> Indoor / trainer
              </label>
            </>
          )}
          {sport === "swim" && (
            <>
              <Field label="Stroke">
                <Select value={f.stroke} onChange={set("stroke")}>
                  <option value="freestyle">Freestyle</option>
                  <option value="breaststroke">Breaststroke</option>
                  <option value="backstroke">Backstroke</option>
                  <option value="butterfly">Butterfly</option>
                  <option value="mixed">Mixed</option>
                </Select>
              </Field>
              {!f.openWater && (
                <Field label="Pool length (m)">
                  <Input type="number" min="0" value={f.pool} onChange={set("pool")} />
                </Field>
              )}
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input type="checkbox" checked={f.openWater} onChange={set("openWater")} /> Open water
              </label>
            </>
          )}
          <Field label="Notes" className="col-span-2 md:col-span-4">
            <Input value={f.notes} onChange={set("notes")} />
          </Field>
        </div>
        {error && <p className="mt-2 text-sm text-critical">{error}</p>}
        <div className="mt-4 flex gap-2">
          <Button type="submit" variant="primary">
            Save
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
