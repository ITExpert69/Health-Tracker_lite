import type { Db } from "../db/types";
import * as repo from "../db/repo";
import { addDays, localDate, localTz } from "./dates";

/** Deterministic pseudo-random so demo data looks the same on every load. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const at = (date: string, hh: number, mm = 0) => new Date(`${date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`).toISOString();

/** Fills ~120 days of realistic history. Intended for trying the app on an empty database. */
export async function loadDemoData(db: Db): Promise<void> {
  const r = rng(42);
  const tz = localTz();
  const today = localDate();
  const days = 120;
  const start = addDays(today, -days + 1);

  await repo.saveSettings(db, { weightGoalKg: 78 });
  await repo.setTarget(db, { valid_from: start, kcal: 2400, protein_g: 160, carbs_g: 260, fat_g: 75 });

  const foods: [string, number, number, number, number, number][] = [
    ["Rolled oats", 372, 13.5, 58.7, 7, 60],
    ["Greek yogurt 2%", 73, 10, 3.6, 2, 200],
    ["Chicken breast", 120, 22.5, 0, 2.6, 180],
    ["Basmati rice (cooked)", 130, 2.7, 28, 0.3, 200],
    ["Banana", 89, 1.1, 22.8, 0.3, 120],
    ["Whole-grain bread", 247, 13, 41, 3.4, 80],
    ["Eggs", 143, 12.6, 0.7, 9.5, 120],
    ["Salmon fillet", 208, 20, 0, 13, 150],
    ["Pasta (cooked)", 158, 5.8, 30.9, 0.9, 220],
    ["Olive oil", 884, 0, 0, 100, 10],
  ];
  const ids: number[] = [];
  for (const [name, kcal, p, c, f, serving] of foods) {
    ids.push(await repo.saveFood(db, { name, brand: null, kcal_100g: kcal, protein_100g: p, carbs_100g: c, fat_100g: f, fiber_100g: null, serving_g: serving }));
  }
  const all = await repo.listFoods(db);
  const food = (i: number) => all.find((f) => f.id === ids[i])!;
  const plan: [string, number[]][] = [
    ["breakfast", [0, 1, 4]],
    ["lunch", [2, 3, 9]],
    ["dinner", [7, 8, 9]],
    ["snacks", [5, 6]],
  ];

  const ex = await repo.listExercises(db);
  const exId = (n: string) => ex.find((e) => e.name === n)!.id;
  const lifts = { A: ["Back Squat", "Bench Press", "Barbell Row"], B: ["Deadlift", "Overhead Press", "Pull-up"] };
  const base: Record<string, number> = { "Back Squat": 100, "Bench Press": 75, "Barbell Row": 70, Deadlift: 130, "Overhead Press": 50, "Pull-up": 0 };

  let weight = 83.5;
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    const dow = (new Date(`${date}T12:00:00`).getDay() + 6) % 7; // Mon=0
    const progress = i / days;

    // Weight: slow cut with daily water noise; skip some days.
    weight -= 0.035 + (r() - 0.5) * 0.02;
    if (r() > 0.15) {
      await repo.addMeasurement(db, { time_utc: at(date, 7, Math.floor(r() * 30)), type: "weight", value: Number((weight + (r() - 0.5) * 1.2).toFixed(1)), unit: "kg" });
    }

    // Nutrition: most days logged, portions vary.
    if (r() > 0.1 || i > days - 7) {
      for (const [meal, items] of plan) {
        for (const fi of items) {
          const f = food(fi);
          const g = Math.round((f.serving_g ?? 100) * (0.75 + r() * 0.6));
          await repo.addFoodEntry(db, { date, meal, food_id: f.id, description: null, quantity_g: g, ...repo.scaleFood(f, g) });
        }
      }
    }

    // Training: runs Tue/Thu/Sun, ride Sat, swim Wed, lifts Mon/Fri.
    if (dow === 1 || dow === 3) {
      const km = 6 + r() * 4;
      const pace = 330 - progress * 15 + r() * 20; // s/km
      await repo.saveActivity(db, { sport: "run", start_utc: at(date, 6, 30), tz, duration_s: km * pace, moving_s: null, distance_m: km * 1000, elevation_gain_m: Math.round(40 + r() * 80), avg_hr: Math.round(145 + r() * 10), max_hr: Math.round(165 + r() * 10), kcal: Math.round(km * 70), name: dow === 1 ? "Easy run" : "Tempo run", notes: null }, {});
    }
    if (dow === 6) {
      const km = 14 + progress * 6 + r() * 4;
      await repo.saveActivity(db, { sport: "run", start_utc: at(date, 8), tz, duration_s: km * (345 + r() * 15), moving_s: null, distance_m: km * 1000, elevation_gain_m: Math.round(100 + r() * 150), avg_hr: Math.round(142 + r() * 8), max_hr: Math.round(160 + r() * 8), kcal: Math.round(km * 72), name: "Long run", notes: null }, {});
    }
    if (dow === 5) {
      const km = 50 + r() * 40;
      const indoor = r() < 0.3;
      await repo.saveActivity(db, { sport: "ride", start_utc: at(date, 9), tz, duration_s: (km / (27 + r() * 4)) * 3600, moving_s: null, distance_m: km * 1000, elevation_gain_m: indoor ? null : Math.round(300 + r() * 600), avg_hr: Math.round(135 + r() * 10), max_hr: Math.round(165 + r() * 10), kcal: Math.round(km * 25), name: indoor ? "Trainer session" : "Weekend ride", notes: null }, { ride: { avg_power_w: Math.round(180 + r() * 40), indoor: indoor ? 1 : 0 } });
    }
    if (dow === 2) {
      const m = 1500 + Math.round(r() * 8) * 100;
      await repo.saveActivity(db, { sport: "swim", start_utc: at(date, 19), tz, duration_s: (m / 100) * (115 - progress * 8 + r() * 8), moving_s: null, distance_m: m, elevation_gain_m: null, avg_hr: null, max_hr: null, kcal: Math.round(m * 0.3), name: "Pool swim", notes: null }, { swim: { pool_length_m: 25, stroke: "freestyle", open_water: 0 } });
    }
    if (dow === 0 || dow === 4) {
      const names = dow === 0 ? lifts.A : lifts.B;
      const sets: repo.WorkoutSetInput[] = [];
      for (const n of names) {
        const top = base[n] ? Math.round((base[n] * (1 + progress * 0.08)) / 2.5) * 2.5 : 0;
        if (top) sets.push({ exercise_id: exId(n), reps: 5, weight_kg: Math.round((top * 0.6) / 2.5) * 2.5, rpe: null, set_type: "warmup" });
        for (let s = 0; s < 3; s++) sets.push({ exercise_id: exId(n), reps: n === "Pull-up" ? 8 + Math.floor(progress * 3) : 5, weight_kg: top || null, rpe: 7 + s * 0.5, set_type: "working" });
      }
      await repo.saveWorkout(db, { start_utc: at(date, 18), tz, duration_s: 3600 + Math.round(r() * 900), name: dow === 0 ? "Strength A" : "Strength B", notes: null }, sets);
    }
  }
  await db.flush?.();
}

export async function isEmpty(db: Db): Promise<boolean> {
  const [{ n }] = await db.select<{ n: number }>(
    `SELECT (SELECT COUNT(*) FROM activity) + (SELECT COUNT(*) FROM workout) + (SELECT COUNT(*) FROM food_entry) + (SELECT COUNT(*) FROM body_measurement) AS n`,
  );
  return n === 0;
}
