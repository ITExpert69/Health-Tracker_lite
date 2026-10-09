import { useMemo, useState } from "react";
import { useApp, useQuery } from "../AppContext";
import { addMeasurement, deleteMeasurement, listMeasurements, type Measurement } from "../db/repo";
import { Button, Card, Empty, Field, Input, PageHeader, StatTile, Table, num } from "../components/ui";
import { Chart, axisStyle, baseOption, useChartTheme } from "../components/Chart";
import { formatDate, fromDateTimeLocal, localDate, toDateTimeLocal } from "../lib/dates";
import { displayToKg, kgToDisplay, massUnit, type UnitSystem } from "../lib/units";
import { weeklyRate, weightTrend } from "../lib/stats";

export const RANGES = { "30d": 30, "90d": 90, "1y": 365, All: 0 } as const;
export type RangeKey = keyof typeof RANGES;

export function RangePicker({ value, onChange }: { value: RangeKey; onChange: (r: RangeKey) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-surface p-0.5 text-sm" role="group" aria-label="Date range">
      {(Object.keys(RANGES) as RangeKey[]).map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          aria-pressed={value === k}
          className={`rounded-md px-2.5 py-1 ${value === k ? "bg-surface-2 font-medium" : "text-ink-2"}`}
        >
          {k}
        </button>
      ))}
    </div>
  );
}

/** Weigh-ins converted to local dates, plus the smoothed trend. */
export function useWeightSeries() {
  const rows = useQuery((db) => listMeasurements(db, "weight"));
  return useMemo(() => {
    const raw = (rows ?? []).map((m) => ({ ...m, date: localDate(new Date(m.time_utc)) }));
    const trend = weightTrend(raw.map((r) => ({ date: r.date, value: r.value })));
    return { rows: rows ? raw : undefined, trend, rate: weeklyRate(trend) };
  }, [rows]);
}

export function WeightChart({
  raw,
  trend,
  units,
  goalKg,
  height = 280,
}: {
  raw: { date: string; value: number }[];
  trend: { date: string; value: number }[];
  units: UnitSystem;
  goalKg?: number | null;
  height?: number;
}) {
  const t = useChartTheme();
  const conv = (kg: number) => Number(kgToDisplay(kg, units).toFixed(2));
  const unit = massUnit(units);
  return (
    <Chart
      height={height}
      option={{
        ...baseOption(t),
        tooltip: {
          ...(baseOption(t).tooltip as object),
          trigger: "axis",
          axisPointer: { type: "line", lineStyle: { color: t.axis } },
          valueFormatter: (v) => `${Number(v).toFixed(1)} ${unit}`,
        },
        xAxis: { type: "time", ...axisStyle(t), splitLine: { show: false } },
        yAxis: { type: "value", scale: true, ...axisStyle(t), axisLabel: { color: t.muted, fontSize: 11, formatter: `{value} ${unit}` } },
        series: [
          {
            name: "Weigh-in",
            type: "scatter",
            symbolSize: 8,
            itemStyle: { color: t.muted, opacity: 0.55 },
            data: raw.map((r) => [r.date, conv(r.value)]),
          },
          {
            name: "Trend",
            type: "line",
            showSymbol: false,
            lineStyle: { width: 2, color: t.series[0] },
            itemStyle: { color: t.series[0] },
            data: trend.map((p) => [p.date, conv(p.value)]),
            markLine: goalKg
              ? {
                  symbol: "none",
                  silent: true,
                  lineStyle: { color: t.ink2, type: "dashed", width: 1 },
                  label: { color: t.ink2, formatter: `Goal ${conv(goalKg)} ${unit}`, position: "insideEndTop" },
                  data: [{ yAxis: conv(goalKg) }],
                }
              : undefined,
          },
        ],
      }}
    />
  );
}

function cutoff(range: RangeKey): string {
  const days = RANGES[range];
  if (!days) return "0000-00-00";
  const d = new Date();
  d.setDate(d.getDate() - days);
  return localDate(d);
}

export default function Weight() {
  const { db, settings, changed } = useApp();
  const u = settings.units;
  const unit = massUnit(u);
  const { rows, trend, rate } = useWeightSeries();
  const [range, setRange] = useState<RangeKey>("90d");
  const [when, setWhen] = useState(() => toDateTimeLocal(new Date().toISOString()));
  const [value, setValue] = useState("");

  const from = cutoff(range);
  const shownRaw = (rows ?? []).filter((r) => r.date >= from);
  const shownTrend = trend.filter((p) => p.date >= from);
  const latest = rows?.[rows.length - 1];
  const latestTrend = trend[trend.length - 1];

  async function add() {
    const v = num(value);
    if (v == null || v <= 0) return;
    await addMeasurement(db, { time_utc: fromDateTimeLocal(when), type: "weight", value: displayToKg(v, u), unit: "kg" });
    setValue("");
    changed();
  }

  async function remove(m: Measurement) {
    await deleteMeasurement(db, m.id);
    changed();
  }

  const fmt = (kg: number) => kgToDisplay(kg, u).toFixed(1);

  return (
    <>
      <PageHeader title="Weight" subtitle="The trend line smooths out day-to-day water swings." actions={<RangePicker value={range} onChange={setRange} />} />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Latest weigh-in" value={latest ? fmt(latest.value) : "–"} unit={latest ? unit : undefined} sub={latest && formatDate(latest.time_utc)} />
        <StatTile label="Trend" value={latestTrend ? fmt(latestTrend.value) : "–"} unit={latestTrend ? unit : undefined} />
        <StatTile
          label="Rate (28 days)"
          value={rate == null ? "–" : `${rate > 0 ? "+" : ""}${kgToDisplay(rate, u).toFixed(2)}`}
          unit={rate == null ? undefined : `${unit}/week`}
        />
        <StatTile
          label="To goal"
          value={settings.weightGoalKg && latestTrend ? `${latestTrend.value > settings.weightGoalKg ? "−" : "+"}${fmt(Math.abs(latestTrend.value - settings.weightGoalKg))}` : "–"}
          unit={settings.weightGoalKg && latestTrend ? unit : undefined}
          sub={settings.weightGoalKg ? `Goal ${fmt(settings.weightGoalKg)} ${unit}` : "Set a goal in Settings"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Weight over time" className="lg:col-span-2">
          {shownRaw.length ? (
            <WeightChart raw={shownRaw} trend={shownTrend} units={u} goalKg={settings.weightGoalKg} />
          ) : (
            <Empty>No weigh-ins in this range yet.</Empty>
          )}
        </Card>

        <Card title="Log a weigh-in">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <Field label="Date & time">
              <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required />
            </Field>
            <Field label={`Weight (${unit})`}>
              <Input type="number" step="0.1" min="0" value={value} onChange={(e) => setValue(e.target.value)} required autoFocus />
            </Field>
            <Button type="submit" variant="primary" className="w-full">
              Add
            </Button>
          </form>
        </Card>
      </div>

      <Card title="Recent weigh-ins" className="mt-4">
        {rows?.length ? (
          <Table head={["Date", `Weight (${unit})`, `Trend (${unit})`, ""]}>
            {[...rows]
              .reverse()
              .slice(0, 30)
              .map((m) => (
                <tr key={m.id}>
                  <td className="px-2 py-1.5">{formatDate(m.time_utc, { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="px-2 py-1.5">{fmt(m.value)}</td>
                  <td className="px-2 py-1.5 text-ink-2">{fmt(trend.find((p) => p.date === m.date)?.value ?? m.value)}</td>
                  <td className="px-2 py-1.5 text-right">
                    <Button variant="danger" onClick={() => void remove(m)} aria-label="Delete weigh-in">
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
          </Table>
        ) : (
          <Empty>Nothing logged yet.</Empty>
        )}
      </Card>
    </>
  );
}
