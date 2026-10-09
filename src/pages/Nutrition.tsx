import { useMemo, useState } from "react";
import { useApp, useQuery } from "../AppContext";
import {
  MEALS,
  addFoodEntry,
  dailyTotals,
  deleteFood,
  deleteFoodEntry,
  listFoodEntries,
  listFoods,
  saveFood,
  scaleFood,
  targetFor,
  type Food,
  type MacroTotals,
} from "../db/repo";
import { Button, Card, Empty, Field, Input, Meter, PageHeader, Select, Table, num } from "../components/ui";
import { Chart, axisStyle, baseOption, useChartTheme } from "../components/Chart";
import { addDays, formatDate, localDate } from "../lib/dates";
import { macroKcal } from "../lib/stats";

const ZERO: MacroTotals = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };

export function sumMacros(rows: MacroTotals[]): MacroTotals {
  return rows.reduce(
    (a, r) => ({ kcal: a.kcal + r.kcal, protein_g: a.protein_g + r.protein_g, carbs_g: a.carbs_g + r.carbs_g, fat_g: a.fat_g + r.fat_g }),
    ZERO,
  );
}

export function MacroMeters({ totals, target }: { totals: MacroTotals; target: MacroTotals | null }) {
  return (
    <div className="space-y-3">
      <Meter label="Calories" value={totals.kcal} target={target?.kcal ?? null} unit="kcal" />
      <Meter label="Protein" value={totals.protein_g} target={target?.protein_g ?? null} unit="g" />
      <Meter label="Carbs" value={totals.carbs_g} target={target?.carbs_g ?? null} unit="g" />
      <Meter label="Fat" value={totals.fat_g} target={target?.fat_g ?? null} unit="g" />
    </div>
  );
}

/** Daily kcal bars for the trailing window with the target as a reference line. */
export function KcalChart({ end, days = 28, height = 240 }: { end: string; days?: number; height?: number }) {
  const t = useChartTheme();
  const start = addDays(end, -(days - 1));
  const rows = useQuery((db) => dailyTotals(db, start, end), [start, end]);
  const target = useQuery((db) => targetFor(db, end), [end]);
  const data = useMemo(() => {
    const byDate = new Map((rows ?? []).map((r) => [r.date, r.kcal]));
    return Array.from({ length: days }, (_, i) => {
      const d = addDays(start, i);
      return [d, Math.round(byDate.get(d) ?? 0)] as [string, number];
    });
  }, [rows, start, days]);
  const logged = data.filter(([, v]) => v > 0);
  const avg = logged.length ? Math.round(logged.reduce((a, [, v]) => a + v, 0) / logged.length) : null;
  return (
    <>
      <div className="mb-1 text-xs text-ink-2">
        {avg != null ? `Average ${avg} kcal over ${logged.length} logged days` : "No days logged in this window"}
        {target ? ` · target ${Math.round(target.kcal)} kcal` : ""}
      </div>
      <Chart
        height={height}
        option={{
          ...baseOption(t),
          legend: { show: false },
          tooltip: { ...(baseOption(t).tooltip as object), trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => `${v} kcal` },
          xAxis: {
            type: "category",
            data: data.map(([d]) => d),
            ...axisStyle(t),
            splitLine: { show: false },
            axisLabel: { color: t.muted, fontSize: 11, formatter: (d: string) => formatDate(d, { day: "numeric", month: "short" }) },
          },
          yAxis: { type: "value", ...axisStyle(t) },
          series: [
            {
              name: "Calories",
              type: "bar",
              barMaxWidth: 18,
              itemStyle: { color: t.series[0], borderRadius: [4, 4, 0, 0] },
              data: data.map(([, v]) => v),
              markLine: target
                ? {
                    symbol: "none",
                    silent: true,
                    lineStyle: { color: t.ink2, type: "dashed", width: 1 },
                    label: { color: t.ink2, formatter: "Target", position: "insideEndTop" },
                    data: [{ yAxis: Math.round(target.kcal) }],
                  }
                : undefined,
            },
          ],
        }}
      />
    </>
  );
}

export default function Nutrition() {
  const { db, changed } = useApp();
  const [date, setDate] = useState(localDate());
  const entries = useQuery((d) => listFoodEntries(d, date), [date]);
  const target = useQuery((d) => targetFor(d, date), [date]);
  const foods = useQuery(listFoods) ?? [];
  const totals = sumMacros(entries ?? []);

  return (
    <>
      <PageHeader
        title="Nutrition"
        subtitle={formatDate(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        actions={
          <>
            <Button onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">
              ←
            </Button>
            <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-40" />
            <Button onClick={() => setDate(addDays(date, 1))} aria-label="Next day">
              →
            </Button>
            {date !== localDate() && <Button onClick={() => setDate(localDate())}>Today</Button>}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Today vs target">
          <MacroMeters totals={totals} target={target ?? null} />
          {!target && <p className="mt-3 text-xs text-muted">Set your targets in Settings to see progress.</p>}
        </Card>
        <Card title="Add food" className="lg:col-span-2">
          <AddEntry date={date} foods={foods} onAdded={changed} />
        </Card>
      </div>

      <Card title="Log" className="mt-4">
        {entries?.length ? (
          <div className="space-y-4">
            {MEALS.map((meal) => {
              const rows = entries.filter((e) => e.meal === meal);
              if (!rows.length) return null;
              const sub = sumMacros(rows);
              return (
                <div key={meal}>
                  <div className="mb-1 flex justify-between text-sm font-semibold">
                    <span className="capitalize">{meal}</span>
                    <span className="tabular font-normal text-ink-2">{Math.round(sub.kcal)} kcal</span>
                  </div>
                  <Table head={["Item", "Amount", "kcal", "Protein", "Carbs", "Fat", ""]}>
                    {rows.map((e) => (
                      <tr key={e.id}>
                        <td className="px-2 py-1.5">{e.food_name ?? e.description ?? "Quick add"}</td>
                        <td className="px-2 py-1.5 text-ink-2">{e.quantity_g ? `${Math.round(e.quantity_g)} g` : "–"}</td>
                        <td className="px-2 py-1.5">{Math.round(e.kcal)}</td>
                        <td className="px-2 py-1.5">{e.protein_g.toFixed(1)} g</td>
                        <td className="px-2 py-1.5">{e.carbs_g.toFixed(1)} g</td>
                        <td className="px-2 py-1.5">{e.fat_g.toFixed(1)} g</td>
                        <td className="px-2 py-1.5 text-right">
                          <Button
                            variant="danger"
                            onClick={async () => {
                              await deleteFoodEntry(db, e.id);
                              changed();
                            }}
                          >
                            Delete
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </Table>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty>Nothing logged for this day.</Empty>
        )}
      </Card>

      <Card title="Calories, last 28 days" className="mt-4">
        <KcalChart end={date} />
      </Card>

      <Card title="Food library" className="mt-4">
        <FoodLibrary foods={foods} onChanged={changed} />
      </Card>
    </>
  );
}

function AddEntry({ date, foods, onAdded }: { date: string; foods: Food[]; onAdded: () => void }) {
  const { db } = useApp();
  const [mode, setMode] = useState<"food" | "quick">(foods.length ? "food" : "quick");
  const [meal, setMeal] = useState<string>(defaultMeal());
  const [foodId, setFoodId] = useState<number | "">("");
  const [grams, setGrams] = useState("");
  const [q, setQ] = useState({ description: "", kcal: "", protein: "", carbs: "", fat: "" });

  const food = foods.find((f) => f.id === foodId);
  const preview = food && num(grams) ? scaleFood(food, num(grams)!) : null;

  async function submit() {
    if (mode === "food") {
      if (!food || !preview) return;
      await addFoodEntry(db, { date, meal, food_id: food.id, description: null, quantity_g: num(grams), ...preview });
      setGrams("");
    } else {
      const p = num(q.protein) ?? 0;
      const c = num(q.carbs) ?? 0;
      const f = num(q.fat) ?? 0;
      const kcal = num(q.kcal) ?? macroKcal(p, c, f);
      if (!kcal) return;
      await addFoodEntry(db, { date, meal, food_id: null, description: q.description || null, quantity_g: null, kcal, protein_g: p, carbs_g: c, fat_g: f });
      setQ({ description: "", kcal: "", protein: "", carbs: "", fat: "" });
    }
    onAdded();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="space-y-3"
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="inline-flex rounded-lg border border-line p-0.5 text-sm" role="group">
          {(["food", "quick"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m} className={`rounded-md px-2.5 py-1 ${mode === m ? "bg-surface-2 font-medium" : "text-ink-2"}`}>
              {m === "food" ? "From library" : "Quick add"}
            </button>
          ))}
        </div>
        <Field label="Meal" className="w-36">
          <Select value={meal} onChange={(e) => setMeal(e.target.value)}>
            {MEALS.map((m) => (
              <option key={m} value={m}>
                {m[0].toUpperCase() + m.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {mode === "food" ? (
        foods.length ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_8rem_auto]">
            <Field label="Food">
              <Select
                value={foodId}
                onChange={(e) => {
                  const id = Number(e.target.value) || "";
                  setFoodId(id);
                  const f = foods.find((x) => x.id === id);
                  if (f?.serving_g && !grams) setGrams(String(f.serving_g));
                }}
                required
              >
                <option value="">Choose…</option>
                {foods.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                    {f.brand ? ` (${f.brand})` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Grams">
              <Input type="number" min="0" step="1" value={grams} onChange={(e) => setGrams(e.target.value)} required />
            </Field>
            <div className="flex items-end">
              <Button type="submit" variant="primary">
                Add
              </Button>
            </div>
            {preview && (
              <p className="tabular text-xs text-ink-2 sm:col-span-3">
                {Math.round(preview.kcal)} kcal · P {preview.protein_g.toFixed(1)} g · C {preview.carbs_g.toFixed(1)} g · F {preview.fat_g.toFixed(1)} g
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">Your food library is empty. Add foods below, or use Quick add.</p>
        )
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
          <Field label="Description" className="col-span-2">
            <Input value={q.description} onChange={(e) => setQ({ ...q, description: e.target.value })} placeholder="e.g. Restaurant lunch" />
          </Field>
          <Field label="kcal">
            <Input type="number" min="0" value={q.kcal} onChange={(e) => setQ({ ...q, kcal: e.target.value })} placeholder="auto" />
          </Field>
          <Field label="Protein g">
            <Input type="number" min="0" step="0.1" value={q.protein} onChange={(e) => setQ({ ...q, protein: e.target.value })} />
          </Field>
          <Field label="Carbs g">
            <Input type="number" min="0" step="0.1" value={q.carbs} onChange={(e) => setQ({ ...q, carbs: e.target.value })} />
          </Field>
          <Field label="Fat g">
            <Input type="number" min="0" step="0.1" value={q.fat} onChange={(e) => setQ({ ...q, fat: e.target.value })} />
          </Field>
          <div className="col-span-2 sm:col-span-6">
            <Button type="submit" variant="primary">
              Add
            </Button>
            <span className="ml-3 text-xs text-muted">Leave kcal empty to compute it from macros (4/4/9).</span>
          </div>
        </div>
      )}
    </form>
  );
}

function defaultMeal(): string {
  const h = new Date().getHours();
  if (h < 11) return "breakfast";
  if (h < 15) return "lunch";
  if (h < 21) return "dinner";
  return "snacks";
}

const EMPTY_FOOD = { name: "", brand: "", kcal: "", protein: "", carbs: "", fat: "", fiber: "", serving: "" };

function FoodLibrary({ foods, onChanged }: { foods: Food[]; onChanged: () => void }) {
  const { db } = useApp();
  const [f, setF] = useState(EMPTY_FOOD);
  const [editing, setEditing] = useState<number | null>(null);
  const [filter, setFilter] = useState("");

  async function save() {
    const kcal = num(f.kcal);
    if (!f.name.trim() || kcal == null) return;
    await saveFood(
      db,
      {
        name: f.name.trim(),
        brand: f.brand.trim() || null,
        kcal_100g: kcal,
        protein_100g: num(f.protein) ?? 0,
        carbs_100g: num(f.carbs) ?? 0,
        fat_100g: num(f.fat) ?? 0,
        fiber_100g: num(f.fiber),
        serving_g: num(f.serving),
      },
      editing ?? undefined,
    );
    setF(EMPTY_FOOD);
    setEditing(null);
    onChanged();
  }

  function edit(food: Food) {
    setEditing(food.id);
    setF({
      name: food.name,
      brand: food.brand ?? "",
      kcal: String(food.kcal_100g),
      protein: String(food.protein_100g),
      carbs: String(food.carbs_100g),
      fat: String(food.fat_100g),
      fiber: food.fiber_100g == null ? "" : String(food.fiber_100g),
      serving: food.serving_g == null ? "" : String(food.serving_g),
    });
  }

  const shown = foods.filter((x) => `${x.name} ${x.brand ?? ""}`.toLowerCase().includes(filter.toLowerCase()));
  const set = (k: keyof typeof EMPTY_FOOD) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="space-y-4">
      <form
        className="grid grid-cols-2 gap-3 sm:grid-cols-9"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="Name" className="col-span-2">
          <Input value={f.name} onChange={set("name")} required />
        </Field>
        <Field label="Brand">
          <Input value={f.brand} onChange={set("brand")} />
        </Field>
        <Field label="kcal/100 g">
          <Input type="number" min="0" step="0.1" value={f.kcal} onChange={set("kcal")} required />
        </Field>
        <Field label="Protein">
          <Input type="number" min="0" step="0.1" value={f.protein} onChange={set("protein")} />
        </Field>
        <Field label="Carbs">
          <Input type="number" min="0" step="0.1" value={f.carbs} onChange={set("carbs")} />
        </Field>
        <Field label="Fat">
          <Input type="number" min="0" step="0.1" value={f.fat} onChange={set("fat")} />
        </Field>
        <Field label="Serving g">
          <Input type="number" min="0" step="1" value={f.serving} onChange={set("serving")} />
        </Field>
        <div className="flex items-end gap-2">
          <Button type="submit" variant="primary">
            {editing ? "Save" : "Add"}
          </Button>
          {editing && (
            <Button
              variant="ghost"
              onClick={() => {
                setEditing(null);
                setF(EMPTY_FOOD);
              }}
            >
              Cancel
            </Button>
          )}
        </div>
      </form>
      {foods.length > 0 && (
        <>
          <Input placeholder="Filter foods…" value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-xs" />
          <Table head={["Food", "kcal/100 g", "Protein", "Carbs", "Fat", "Serving", ""]}>
            {shown.map((x) => (
              <tr key={x.id}>
                <td className="px-2 py-1.5">
                  {x.name}
                  {x.brand && <span className="text-muted"> · {x.brand}</span>}
                </td>
                <td className="px-2 py-1.5">{x.kcal_100g}</td>
                <td className="px-2 py-1.5">{x.protein_100g} g</td>
                <td className="px-2 py-1.5">{x.carbs_100g} g</td>
                <td className="px-2 py-1.5">{x.fat_100g} g</td>
                <td className="px-2 py-1.5 text-ink-2">{x.serving_g ? `${x.serving_g} g` : "–"}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right">
                  <Button variant="ghost" onClick={() => edit(x)}>
                    Edit
                  </Button>
                  <Button
                    variant="danger"
                    onClick={async () => {
                      await deleteFood(db, x.id);
                      onChanged();
                    }}
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </div>
  );
}
