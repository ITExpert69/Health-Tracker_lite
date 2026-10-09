import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useApp, useQuery } from "../AppContext";
import { listActivities, listFoodEntries, listWorkouts, targetFor } from "../db/repo";
import { Card, Empty, PageHeader, StatTile } from "../components/ui";
import { Chart, axisStyle, baseOption, useChartTheme } from "../components/Chart";
import { addDays, formatDate, localDate, weekStart } from "../lib/dates";
import { formatDistance, formatHours, kgToDisplay, massUnit, type Sport } from "../lib/units";
import { MacroMeters, sumMacros } from "./Nutrition";
import { WeightChart, useWeightSeries } from "./Weight";
import { SPORTS } from "./Activities";

const WEEKS = 8;
type Kind = Sport | "lift";
const KINDS: { key: Kind; label: string; series: 0 | 1 | 2 | 3 }[] = [
  { key: "run", label: "Run", series: 0 },
  { key: "ride", label: "Ride", series: 1 },
  { key: "swim", label: "Swim", series: 2 },
  { key: "lift", label: "Strength", series: 3 },
];

export default function Dashboard() {
  const { settings } = useApp();
  const u = settings.units;
  const t = useChartTheme();
  const today = localDate();
  const thisWeek = weekStart(today);
  const firstWeek = addDays(thisWeek, -7 * (WEEKS - 1));
  const fromUtc = new Date(`${firstWeek}T00:00:00`).toISOString();

  const activities = useQuery((d) => listActivities(d, { fromUtc }), [fromUtc]);
  const workouts = useQuery((d) => listWorkouts(d, fromUtc), [fromUtc]);
  const entries = useQuery((d) => listFoodEntries(d, today), [today]);
  const target = useQuery((d) => targetFor(d, today), [today]);
  const { rows: weighIns, trend, rate } = useWeightSeries();

  // Hours per week per kind. Workouts without a duration count as 1 h so they still show up.
  const weekly = useMemo(() => {
    const weeks = Array.from({ length: WEEKS }, (_, i) => addDays(firstWeek, 7 * i));
    const grid: Record<Kind, number[]> = { run: [], ride: [], swim: [], lift: [] };
    for (const k of KINDS) grid[k.key] = weeks.map(() => 0);
    for (const a of activities ?? []) {
      const i = weeks.indexOf(weekStart(localDate(new Date(a.start_utc))));
      if (i >= 0) grid[a.sport][i] += a.duration_s / 3600;
    }
    for (const w of workouts ?? []) {
      const i = weeks.indexOf(weekStart(localDate(new Date(w.start_utc))));
      if (i >= 0) grid.lift[i] += (w.duration_s ?? 3600) / 3600;
    }
    return { weeks, grid };
  }, [activities, workouts, firstWeek]);

  const cur = WEEKS - 1;
  const weekHours = KINDS.reduce((s, k) => s + weekly.grid[k.key][cur], 0);
  const totals = sumMacros(entries ?? []);
  const latestTrend = trend[trend.length - 1];
  const weekActs = (activities ?? []).filter((a) => localDate(new Date(a.start_utc)) >= thisWeek);
  const weekLifts = (workouts ?? []).filter((w) => localDate(new Date(w.start_utc)) >= thisWeek);

  const recent = useMemo(() => {
    const items = [
      ...(activities ?? []).map((a) => ({
        id: `a${a.id}`,
        when: a.start_utc,
        kind: a.sport as Kind,
        title: a.name ?? SPORTS[a.sport].label,
        detail: `${formatDistance(a.sport, a.distance_m, u)} · ${formatHours(a.duration_s)}`,
        to: `/activities/${a.sport}`,
      })),
      ...(workouts ?? []).map((w) => ({
        id: `w${w.id}`,
        when: w.start_utc,
        kind: "lift" as Kind,
        title: w.name ?? "Workout",
        detail: `${w.set_count} sets · ${Math.round(kgToDisplay(w.volume_kg, u)).toLocaleString()} ${massUnit(u)}`,
        to: "/lifts",
      })),
    ];
    return items.sort((a, b) => b.when.localeCompare(a.when)).slice(0, 8);
  }, [activities, workouts, u]);

  const kindColor = (k: Kind) => t.series[KINDS.find((x) => x.key === k)!.series];

  return (
    <>
      <PageHeader title="This week" subtitle={`Week of ${formatDate(thisWeek, { day: "numeric", month: "long" })} · today is ${formatDate(today, { weekday: "long" })}`} />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Training time" value={formatHours(weekHours * 3600)} sub={`${weekActs.length} cardio · ${weekLifts.length} strength`} />
        <StatTile
          label="Calories today"
          value={Math.round(totals.kcal).toLocaleString()}
          unit="kcal"
          sub={target ? (totals.kcal > target.kcal ? `${Math.round(totals.kcal - target.kcal).toLocaleString()} kcal over target` : `${Math.round(target.kcal - totals.kcal).toLocaleString()} kcal left of ${Math.round(target.kcal).toLocaleString()}`) : "No target set"}
        />
        <StatTile
          label="Weight trend"
          value={latestTrend ? kgToDisplay(latestTrend.value, u).toFixed(1) : "–"}
          unit={latestTrend ? massUnit(u) : undefined}
          sub={rate == null ? "Log weigh-ins to see a trend" : `${rate > 0 ? "+" : ""}${kgToDisplay(rate, u).toFixed(2)} ${massUnit(u)}/week`}
        />
        <StatTile label="Protein today" value={Math.round(totals.protein_g)} unit="g" sub={target ? `target ${Math.round(target.protein_g)} g` : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={`Training hours per week, last ${WEEKS} weeks`} className="lg:col-span-2">
          <Chart
            height={260}
            option={{
              ...baseOption(t),
              legend: { show: false },
              grid: { left: 8, right: 16, top: 12, bottom: 8, containLabel: true },
              tooltip: {
                ...(baseOption(t).tooltip as object),
                trigger: "axis",
                axisPointer: { type: "shadow" },
                valueFormatter: (v) => formatHours(Number(v) * 3600),
              },
              xAxis: {
                type: "category",
                data: weekly.weeks,
                ...axisStyle(t),
                splitLine: { show: false },
                axisLabel: { color: t.muted, fontSize: 11, formatter: (d: string) => formatDate(d, { day: "numeric", month: "short" }) },
              },
              yAxis: { type: "value", ...axisStyle(t), axisLabel: { color: t.muted, fontSize: 11, formatter: "{value} h" } },
              series: KINDS.map((k, i) => ({
                name: k.label,
                type: "bar",
                stack: "time",
                barMaxWidth: 32,
                // 2px surface gap between stacked segments; round only the top of the stack.
                itemStyle: { color: t.series[k.series], borderColor: t.surface, borderWidth: 1, borderRadius: i === KINDS.length - 1 ? [4, 4, 0, 0] : 0 },
                emphasis: { focus: "series" },
                data: weekly.grid[k.key].map((h) => Number(h.toFixed(2))),
              })),
            }}
          />
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-line pt-3 text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">This week</span>
            {KINDS.map((k) => (
              <div key={k.key} className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-ink-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: kindColor(k.key) }} />
                  {k.label}
                </span>
                <span className="tabular">{formatHours(weekly.grid[k.key][cur] * 3600)}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Today’s nutrition" actions={<Link to="/nutrition" className="text-xs text-accent">Log food →</Link>}>
          <MacroMeters totals={totals} target={target ?? null} />
          {!target && (
            <p className="mt-3 text-xs text-muted">
              <Link to="/settings" className="text-accent">
                Set targets
              </Link>{" "}
              to track progress.
            </p>
          )}
        </Card>

        <Card title="Weight, last 90 days" className="lg:col-span-2" actions={<Link to="/weight" className="text-xs text-accent">Log weight →</Link>}>
          {weighIns?.length ? (
            <WeightChart
              raw={weighIns.filter((r) => r.date >= addDays(today, -90))}
              trend={trend.filter((p) => p.date >= addDays(today, -90))}
              units={u}
              goalKg={settings.weightGoalKg}
              height={240}
            />
          ) : (
            <Empty>No weigh-ins yet.</Empty>
          )}
        </Card>

        <Card title="Recent sessions">
          {recent.length ? (
            <ul className="divide-y divide-line text-sm">
              {recent.map((r) => (
                <li key={r.id}>
                  <Link to={r.to} className="flex items-center gap-3 py-2 hover:opacity-80">
                    <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: kindColor(r.kind) }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.title}</span>
                      <span className="block text-xs text-ink-2">{r.detail}</span>
                    </span>
                    <span className="whitespace-nowrap text-xs text-muted">{formatDate(r.when, { weekday: "short", day: "numeric", month: "short" })}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No sessions in the last {WEEKS} weeks.</Empty>
          )}
        </Card>
      </div>
    </>
  );
}
