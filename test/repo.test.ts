import { describe, expect, it } from "vitest";
import { freshDb } from "./helpers";
import * as repo from "../src/db/repo";
import { migrate } from "../src/db/migrations";

describe("migrations", () => {
  it("is idempotent and seeds exercises once", async () => {
    const db = await freshDb();
    await migrate(db);
    const ex = await repo.listExercises(db);
    expect(ex.length).toBeGreaterThan(10);
    expect(new Set(ex.map((e) => e.name)).size).toBe(ex.length);
  });
});

describe("settings", () => {
  it("defaults and saves", async () => {
    const db = await freshDb();
    expect(await repo.getSettings(db)).toEqual({ units: "metric", weightGoalKg: null, lastBackupAt: null });
    await repo.saveSettings(db, { units: "imperial", weightGoalKg: 75 });
    expect(await repo.getSettings(db)).toMatchObject({ units: "imperial", weightGoalKg: 75 });
  });
});

describe("nutrition", () => {
  it("sums daily totals and resolves the target in force", async () => {
    const db = await freshDb();
    const foodId = await repo.saveFood(db, {
      name: "Oats", brand: null, kcal_100g: 380, protein_100g: 13, carbs_100g: 60, fat_100g: 7, fiber_100g: 10, serving_g: 50,
    });
    const [oats] = await repo.listFoods(db);
    const m = repo.scaleFood(oats, 50);
    expect(m.kcal).toBe(190);
    await repo.addFoodEntry(db, { date: "2026-10-09", meal: "breakfast", food_id: foodId, description: null, quantity_g: 50, ...m });
    await repo.addFoodEntry(db, { date: "2026-10-09", meal: "dinner", food_id: null, description: "Restaurant", quantity_g: null, kcal: 800, protein_g: 40, carbs_g: 80, fat_g: 30 });
    await repo.addFoodEntry(db, { date: "2026-10-10", meal: "lunch", food_id: null, description: "x", quantity_g: null, kcal: 100, protein_g: 1, carbs_g: 1, fat_g: 1 });
    const totals = await repo.dailyTotals(db, "2026-10-09", "2026-10-09");
    expect(totals).toHaveLength(1);
    expect(totals[0].kcal).toBe(990);
    expect(totals[0].protein_g).toBeCloseTo(46.5);
    const entries = await repo.listFoodEntries(db, "2026-10-09");
    expect(entries[0].food_name).toBe("Oats");

    await repo.setTarget(db, { valid_from: "2026-01-01", kcal: 2500, protein_g: 150, carbs_g: 300, fat_g: 70 });
    await repo.setTarget(db, { valid_from: "2026-10-01", kcal: 2200, protein_g: 160, carbs_g: 230, fat_g: 70 });
    expect((await repo.targetFor(db, "2026-09-30"))?.kcal).toBe(2500);
    expect((await repo.targetFor(db, "2026-10-09"))?.kcal).toBe(2200);
    expect(await repo.targetFor(db, "2025-12-31")).toBeNull();
  });
});

describe("lifts", () => {
  it("saves a workout, summarizes volume excluding warmups, and edits it", async () => {
    const db = await freshDb();
    const ex = await repo.listExercises(db);
    const squat = ex.find((e) => e.name === "Back Squat")!;
    const bench = ex.find((e) => e.name === "Bench Press")!;
    const w = { start_utc: "2026-10-08T17:00:00.000Z", tz: "Europe/Berlin", duration_s: 3600, name: "Push", notes: null };
    const id = await repo.saveWorkout(db, w, [
      { exercise_id: squat.id, reps: 5, weight_kg: 60, rpe: null, set_type: "warmup" },
      { exercise_id: squat.id, reps: 5, weight_kg: 100, rpe: 8, set_type: "working" },
      { exercise_id: bench.id, reps: 8, weight_kg: 70, rpe: null, set_type: "working" },
    ]);
    let [summary] = await repo.listWorkouts(db);
    expect(summary.set_count).toBe(3);
    expect(summary.volume_kg).toBe(500 + 560);
    expect(summary.exercises?.split(", ").sort()).toEqual(["Back Squat", "Bench Press"]);

    await repo.saveWorkout(db, w, [{ exercise_id: bench.id, reps: 5, weight_kg: 80, rpe: null, set_type: "working" }], id);
    [summary] = await repo.listWorkouts(db);
    expect(summary.set_count).toBe(1);
    expect((await repo.exerciseHistory(db, squat.id))).toHaveLength(0);
    expect((await repo.usedExercises(db)).map((e) => e.name)).toEqual(["Bench Press"]);

    await repo.deleteWorkout(db, id);
    expect(await repo.listWorkouts(db)).toHaveLength(0);
  });
});

describe("activities", () => {
  it("stores sport details and filters by sport", async () => {
    const db = await freshDb();
    const base = { tz: "UTC", moving_s: null, elevation_gain_m: null, avg_hr: 140, max_hr: null, kcal: null, notes: null };
    await repo.saveActivity(db, { ...base, sport: "run", start_utc: "2026-10-01T06:00:00Z", duration_s: 1800, distance_m: 6000, name: "Easy" }, {});
    const swimId = await repo.saveActivity(
      db,
      { ...base, sport: "swim", start_utc: "2026-10-02T06:00:00Z", duration_s: 2400, distance_m: 2000, name: "Pool" },
      { swim: { pool_length_m: 25, stroke: "freestyle", open_water: 0 } },
    );
    await repo.saveActivity(
      db,
      { ...base, sport: "ride", start_utc: "2026-10-03T06:00:00Z", duration_s: 3600, distance_m: 30000, name: "Trainer" },
      { ride: { avg_power_w: 210, indoor: 1 } },
    );
    const all = await repo.listActivities(db);
    expect(all.map((a) => a.sport)).toEqual(["ride", "swim", "run"]);
    expect(all[0].avg_power_w).toBe(210);
    expect(all[1].pool_length_m).toBe(25);
    expect(await repo.listActivities(db, { sport: "run" })).toHaveLength(1);
    expect(await repo.listActivities(db, { fromUtc: "2026-10-02T00:00:00Z" })).toHaveLength(2);
    await repo.deleteActivity(db, swimId);
    expect(await repo.listActivities(db)).toHaveLength(2);
  });
});

describe("backup", () => {
  it("round-trips all data into a fresh database", async () => {
    const db = await freshDb();
    await repo.addMeasurement(db, { time_utc: "2026-10-09T07:00:00Z", type: "weight", value: 80.2, unit: "kg" });
    await repo.saveSettings(db, { units: "imperial" });
    const ex = await repo.listExercises(db);
    await repo.saveWorkout(db, { start_utc: "2026-10-08T17:00:00Z", tz: "UTC", duration_s: null, name: null, notes: null }, [
      { exercise_id: ex[0].id, reps: 5, weight_kg: 100, rpe: null, set_type: "working" },
    ]);
    const backup = JSON.parse(JSON.stringify(await repo.exportBackup(db)));

    const db2 = await freshDb();
    await repo.addMeasurement(db2, { time_utc: "2020-01-01T00:00:00Z", type: "weight", value: 1, unit: "kg" });
    await repo.restoreBackup(db2, backup);
    const w = await repo.listMeasurements(db2, "weight");
    expect(w.map((m) => m.value)).toEqual([80.2]);
    expect((await repo.getSettings(db2)).units).toBe("imperial");
    expect((await repo.listWorkouts(db2))[0].set_count).toBe(1);
    expect((await repo.listExercises(db2)).length).toBe(ex.length);
  });

  it("rejects foreign files", async () => {
    const db = await freshDb();
    await expect(repo.restoreBackup(db, { foo: 1 } as never)).rejects.toThrow();
  });
});

describe("clear and food deletion", () => {
  it("keeps entry names when a food is deleted and clears all data", async () => {
    const db = await freshDb();
    const id = await repo.saveFood(db, { name: "Rice", brand: null, kcal_100g: 130, protein_100g: 3, carbs_100g: 28, fat_100g: 0, fiber_100g: null, serving_g: null });
    await repo.addFoodEntry(db, { date: "2026-10-09", meal: "lunch", food_id: id, description: null, quantity_g: 100, kcal: 130, protein_g: 3, carbs_g: 28, fat_g: 0 });
    await repo.deleteFood(db, id);
    const [e] = await repo.listFoodEntries(db, "2026-10-09");
    expect(e.food_id).toBeNull();
    expect(e.description).toBe("Rice");

    const { loadDemoData, isEmpty } = await import("../src/lib/demo");
    await loadDemoData(db);
    expect(await isEmpty(db)).toBe(false);
    expect((await repo.listActivities(db)).length).toBeGreaterThan(30);
    await repo.clearAllData(db);
    expect(await isEmpty(db)).toBe(true);
    expect((await repo.listExercises(db)).length).toBeGreaterThan(10);
  });
});
