import type { Db, SqlValue } from "./types";
import type { Sport, UnitSystem } from "../lib/units";

// ---------- Settings ----------

export interface Settings {
  units: UnitSystem;
  weightGoalKg: number | null;
  /** ISO time of the last successful backup export. */
  lastBackupAt: string | null;
}

const DEFAULT_SETTINGS: Settings = { units: "metric", weightGoalKg: null, lastBackupAt: null };

export async function getSettings(db: Db): Promise<Settings> {
  const rows = await db.select<{ key: string; value: string }>(`SELECT key, value FROM setting`);
  const s: Settings = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (r.key in s) (s as unknown as Record<string, unknown>)[r.key] = JSON.parse(r.value);
  }
  return s;
}

export async function saveSettings(db: Db, patch: Partial<Settings>): Promise<void> {
  for (const [k, v] of Object.entries(patch)) {
    await db.execute(
      `INSERT INTO setting (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [k, JSON.stringify(v)],
    );
  }
  await db.flush?.();
}

// ---------- Body measurements ----------

export interface Measurement {
  id: number;
  time_utc: string;
  type: string;
  value: number;
  unit: string;
  source_id: number | null;
}

export async function addMeasurement(db: Db, m: { time_utc: string; type: string; value: number; unit: string }): Promise<number> {
  const r = await db.execute(`INSERT INTO body_measurement (time_utc, type, value, unit) VALUES (?, ?, ?, ?)`, [
    m.time_utc,
    m.type,
    m.value,
    m.unit,
  ]);
  await db.flush?.();
  return r.lastInsertId;
}

export function listMeasurements(db: Db, type: string, fromUtc?: string): Promise<Measurement[]> {
  const params: SqlValue[] = [type];
  let where = `type = ?`;
  if (fromUtc) {
    where += ` AND time_utc >= ?`;
    params.push(fromUtc);
  }
  return db.select<Measurement>(`SELECT * FROM body_measurement WHERE ${where} ORDER BY time_utc`, params);
}

export async function deleteMeasurement(db: Db, id: number): Promise<void> {
  await db.execute(`DELETE FROM body_measurement WHERE id = ?`, [id]);
  await db.flush?.();
}

// ---------- Nutrition ----------

export interface Food {
  id: number;
  name: string;
  brand: string | null;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  fiber_100g: number | null;
  serving_g: number | null;
}

export type FoodInput = Omit<Food, "id">;

export interface FoodEntry {
  id: number;
  date: string;
  meal: string;
  food_id: number | null;
  description: string | null;
  quantity_g: number | null;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export type FoodEntryInput = Omit<FoodEntry, "id">;

export interface MacroTotals {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface NutritionTarget extends MacroTotals {
  valid_from: string;
}

export const MEALS = ["breakfast", "lunch", "dinner", "snacks"] as const;

export function listFoods(db: Db): Promise<Food[]> {
  return db.select<Food>(`SELECT * FROM food ORDER BY name COLLATE NOCASE`);
}

export async function saveFood(db: Db, f: FoodInput, id?: number): Promise<number> {
  const vals: SqlValue[] = [f.name, f.brand, f.kcal_100g, f.protein_100g, f.carbs_100g, f.fat_100g, f.fiber_100g, f.serving_g];
  let newId = id ?? 0;
  if (id) {
    await db.execute(
      `UPDATE food SET name=?, brand=?, kcal_100g=?, protein_100g=?, carbs_100g=?, fat_100g=?, fiber_100g=?, serving_g=? WHERE id=?`,
      [...vals, id],
    );
  } else {
    newId = (
      await db.execute(
        `INSERT INTO food (name, brand, kcal_100g, protein_100g, carbs_100g, fat_100g, fiber_100g, serving_g) VALUES (?,?,?,?,?,?,?,?)`,
        vals,
      )
    ).lastInsertId;
  }
  await db.flush?.();
  return newId;
}

export async function deleteFood(db: Db, id: number): Promise<void> {
  // Past entries keep their totals; preserve the name so the log stays readable.
  await db.execute(
    `UPDATE food_entry SET description = COALESCE(description, (SELECT name FROM food WHERE id = ?)) WHERE food_id = ?`,
    [id, id],
  );
  await db.execute(`DELETE FROM food WHERE id = ?`, [id]);
  await db.flush?.();
}

/** Macros for a quantity of a food, from its per-100 g values. */
export function scaleFood(f: Food, grams: number): MacroTotals {
  const k = grams / 100;
  return { kcal: f.kcal_100g * k, protein_g: f.protein_100g * k, carbs_g: f.carbs_100g * k, fat_g: f.fat_100g * k };
}

export async function addFoodEntry(db: Db, e: FoodEntryInput): Promise<number> {
  const r = await db.execute(
    `INSERT INTO food_entry (date, meal, food_id, description, quantity_g, kcal, protein_g, carbs_g, fat_g) VALUES (?,?,?,?,?,?,?,?,?)`,
    [e.date, e.meal, e.food_id, e.description, e.quantity_g, e.kcal, e.protein_g, e.carbs_g, e.fat_g],
  );
  await db.flush?.();
  return r.lastInsertId;
}

export async function deleteFoodEntry(db: Db, id: number): Promise<void> {
  await db.execute(`DELETE FROM food_entry WHERE id = ?`, [id]);
  await db.flush?.();
}

export function listFoodEntries(db: Db, date: string): Promise<(FoodEntry & { food_name: string | null })[]> {
  return db.select(
    `SELECT e.*, f.name AS food_name FROM food_entry e LEFT JOIN food f ON f.id = e.food_id WHERE e.date = ? ORDER BY e.id`,
    [date],
  );
}

export function dailyTotals(db: Db, from: string, to: string): Promise<(MacroTotals & { date: string })[]> {
  return db.select(
    `SELECT date, SUM(kcal) AS kcal, SUM(protein_g) AS protein_g, SUM(carbs_g) AS carbs_g, SUM(fat_g) AS fat_g
     FROM food_entry WHERE date BETWEEN ? AND ? GROUP BY date ORDER BY date`,
    [from, to],
  );
}

/** The target in force on a date (latest valid_from on or before it). */
export async function targetFor(db: Db, date: string): Promise<NutritionTarget | null> {
  const rows = await db.select<NutritionTarget>(
    `SELECT * FROM nutrition_target WHERE valid_from <= ? ORDER BY valid_from DESC LIMIT 1`,
    [date],
  );
  return rows[0] ?? null;
}

export function listTargets(db: Db): Promise<NutritionTarget[]> {
  return db.select<NutritionTarget>(`SELECT * FROM nutrition_target ORDER BY valid_from DESC`);
}

export async function setTarget(db: Db, t: NutritionTarget): Promise<void> {
  await db.execute(
    `INSERT INTO nutrition_target (valid_from, kcal, protein_g, carbs_g, fat_g) VALUES (?,?,?,?,?)
     ON CONFLICT(valid_from) DO UPDATE SET kcal=excluded.kcal, protein_g=excluded.protein_g, carbs_g=excluded.carbs_g, fat_g=excluded.fat_g`,
    [t.valid_from, t.kcal, t.protein_g, t.carbs_g, t.fat_g],
  );
  await db.flush?.();
}

// ---------- Lifts ----------

export interface Exercise {
  id: number;
  name: string;
  category: string;
  primary_muscles: string | null;
  aliases: string;
}

export interface Workout {
  id: number;
  start_utc: string;
  tz: string;
  duration_s: number | null;
  name: string | null;
  notes: string | null;
}

export interface WorkoutSet {
  id: number;
  workout_id: number;
  exercise_id: number;
  set_idx: number;
  reps: number | null;
  weight_kg: number | null;
  rpe: number | null;
  set_type: string;
}

export type WorkoutSetInput = Pick<WorkoutSet, "exercise_id" | "reps" | "weight_kg" | "rpe" | "set_type">;

export interface WorkoutSummary extends Workout {
  set_count: number;
  volume_kg: number;
  exercises: string | null;
}

export function listExercises(db: Db): Promise<Exercise[]> {
  return db.select<Exercise>(`SELECT * FROM exercise ORDER BY name COLLATE NOCASE`);
}

export async function createExercise(db: Db, name: string, category: string): Promise<number> {
  const r = await db.execute(`INSERT INTO exercise (name, category) VALUES (?, ?)`, [name.trim(), category]);
  await db.flush?.();
  return r.lastInsertId;
}

export async function saveWorkout(
  db: Db,
  w: Omit<Workout, "id">,
  sets: WorkoutSetInput[],
  id?: number,
): Promise<number> {
  let wid = id ?? 0;
  if (id) {
    await db.execute(`UPDATE workout SET start_utc=?, tz=?, duration_s=?, name=?, notes=? WHERE id=?`, [
      w.start_utc,
      w.tz,
      w.duration_s,
      w.name,
      w.notes,
      id,
    ]);
    await db.execute(`DELETE FROM workout_set WHERE workout_id = ?`, [id]);
  } else {
    wid = (
      await db.execute(`INSERT INTO workout (start_utc, tz, duration_s, name, notes) VALUES (?,?,?,?,?)`, [
        w.start_utc,
        w.tz,
        w.duration_s,
        w.name,
        w.notes,
      ])
    ).lastInsertId;
  }
  let idx = 0;
  for (const s of sets) {
    await db.execute(
      `INSERT INTO workout_set (workout_id, exercise_id, set_idx, reps, weight_kg, rpe, set_type) VALUES (?,?,?,?,?,?,?)`,
      [wid, s.exercise_id, idx++, s.reps, s.weight_kg, s.rpe, s.set_type],
    );
  }
  await db.flush?.();
  return wid;
}

export async function deleteWorkout(db: Db, id: number): Promise<void> {
  await db.execute(`DELETE FROM workout_set WHERE workout_id = ?`, [id]);
  await db.execute(`DELETE FROM workout WHERE id = ?`, [id]);
  await db.flush?.();
}

export function listWorkouts(db: Db, fromUtc?: string): Promise<WorkoutSummary[]> {
  return db.select<WorkoutSummary>(
    `SELECT w.*,
            COUNT(s.id) AS set_count,
            COALESCE(SUM(CASE WHEN s.set_type != 'warmup' THEN s.reps * s.weight_kg END), 0) AS volume_kg,
            (SELECT GROUP_CONCAT(name, ', ') FROM (
               SELECT DISTINCT e.name FROM workout_set s2 JOIN exercise e ON e.id = s2.exercise_id
               WHERE s2.workout_id = w.id)) AS exercises
     FROM workout w LEFT JOIN workout_set s ON s.workout_id = w.id
     ${fromUtc ? "WHERE w.start_utc >= ?" : ""}
     GROUP BY w.id ORDER BY w.start_utc DESC`,
    fromUtc ? [fromUtc] : [],
  );
}

export async function getWorkout(db: Db, id: number): Promise<{ workout: Workout; sets: WorkoutSet[] } | null> {
  const [workout] = await db.select<Workout>(`SELECT * FROM workout WHERE id = ?`, [id]);
  if (!workout) return null;
  const sets = await db.select<WorkoutSet>(`SELECT * FROM workout_set WHERE workout_id = ? ORDER BY set_idx`, [id]);
  return { workout, sets };
}

export interface ExerciseSetRow {
  start_utc: string;
  workout_id: number;
  reps: number | null;
  weight_kg: number | null;
  rpe: number | null;
  set_type: string;
}

export function exerciseHistory(db: Db, exerciseId: number): Promise<ExerciseSetRow[]> {
  return db.select<ExerciseSetRow>(
    `SELECT w.start_utc, w.id AS workout_id, s.reps, s.weight_kg, s.rpe, s.set_type
     FROM workout_set s JOIN workout w ON w.id = s.workout_id
     WHERE s.exercise_id = ? ORDER BY w.start_utc, s.set_idx`,
    [exerciseId],
  );
}

/** Exercises that have at least one logged set, most-used first. */
export function usedExercises(db: Db): Promise<(Exercise & { set_count: number })[]> {
  return db.select(
    `SELECT e.*, COUNT(s.id) AS set_count FROM exercise e JOIN workout_set s ON s.exercise_id = e.id
     GROUP BY e.id ORDER BY set_count DESC`,
  );
}

// ---------- Activities (run / ride / swim) ----------

export interface Activity {
  id: number;
  sport: Sport;
  start_utc: string;
  tz: string;
  duration_s: number;
  moving_s: number | null;
  distance_m: number | null;
  elevation_gain_m: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  kcal: number | null;
  name: string | null;
  notes: string | null;
  source_id: number | null;
}

export interface SwimDetail {
  pool_length_m: number | null;
  stroke: string | null;
  open_water: number;
}

export interface RideDetail {
  avg_power_w: number | null;
  indoor: number;
}

export type ActivityInput = Omit<Activity, "id" | "source_id">;

export type ActivityRow = Activity & Partial<SwimDetail> & Partial<RideDetail>;

export async function saveActivity(
  db: Db,
  a: ActivityInput,
  detail: { swim?: SwimDetail; ride?: RideDetail },
  id?: number,
): Promise<number> {
  const vals: SqlValue[] = [
    a.sport,
    a.start_utc,
    a.tz,
    a.duration_s,
    a.moving_s,
    a.distance_m,
    a.elevation_gain_m,
    a.avg_hr,
    a.max_hr,
    a.kcal,
    a.name,
    a.notes,
  ];
  let aid = id ?? 0;
  if (id) {
    await db.execute(
      `UPDATE activity SET sport=?, start_utc=?, tz=?, duration_s=?, moving_s=?, distance_m=?, elevation_gain_m=?,
       avg_hr=?, max_hr=?, kcal=?, name=?, notes=? WHERE id=?`,
      [...vals, id],
    );
    await db.execute(`DELETE FROM swim_detail WHERE activity_id = ?`, [id]);
    await db.execute(`DELETE FROM ride_detail WHERE activity_id = ?`, [id]);
  } else {
    aid = (
      await db.execute(
        `INSERT INTO activity (sport, start_utc, tz, duration_s, moving_s, distance_m, elevation_gain_m, avg_hr, max_hr, kcal, name, notes)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        vals,
      )
    ).lastInsertId;
  }
  if (a.sport === "swim" && detail.swim) {
    await db.execute(`INSERT INTO swim_detail (activity_id, pool_length_m, stroke, open_water) VALUES (?,?,?,?)`, [
      aid,
      detail.swim.pool_length_m,
      detail.swim.stroke,
      detail.swim.open_water,
    ]);
  }
  if (a.sport === "ride" && detail.ride) {
    await db.execute(`INSERT INTO ride_detail (activity_id, avg_power_w, indoor) VALUES (?,?,?)`, [
      aid,
      detail.ride.avg_power_w,
      detail.ride.indoor,
    ]);
  }
  await db.flush?.();
  return aid;
}

export async function deleteActivity(db: Db, id: number): Promise<void> {
  await db.execute(`DELETE FROM swim_detail WHERE activity_id = ?`, [id]);
  await db.execute(`DELETE FROM ride_detail WHERE activity_id = ?`, [id]);
  await db.execute(`DELETE FROM activity WHERE id = ?`, [id]);
  await db.flush?.();
}

export function listActivities(db: Db, opts: { sport?: Sport; fromUtc?: string } = {}): Promise<ActivityRow[]> {
  const where: string[] = [];
  const params: SqlValue[] = [];
  if (opts.sport) {
    where.push(`a.sport = ?`);
    params.push(opts.sport);
  }
  if (opts.fromUtc) {
    where.push(`a.start_utc >= ?`);
    params.push(opts.fromUtc);
  }
  return db.select<ActivityRow>(
    `SELECT a.*, s.pool_length_m, s.stroke, s.open_water, r.avg_power_w, r.indoor
     FROM activity a
     LEFT JOIN swim_detail s ON s.activity_id = a.id
     LEFT JOIN ride_detail r ON r.activity_id = a.id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY a.start_utc DESC`,
    params,
  );
}

// ---------- Backup ----------

/** Tables in dependency order (parents before children). */
export const BACKUP_TABLES = [
  "setting",
  "import_source",
  "exercise",
  "food",
  "nutrition_target",
  "body_measurement",
  "food_entry",
  "workout",
  "workout_set",
  "activity",
  "activity_lap",
  "swim_detail",
  "ride_detail",
] as const;

export interface Backup {
  app: "health-tracker";
  schema_version: number;
  exported_at: string;
  tables: Record<string, Record<string, SqlValue>[]>;
}

export async function exportBackup(db: Db): Promise<Backup> {
  const [{ v }] = await db.select<{ v: number }>(`SELECT MAX(version) AS v FROM schema_migrations`);
  const tables: Backup["tables"] = {};
  for (const t of BACKUP_TABLES) tables[t] = await db.select(`SELECT * FROM ${t}`);
  return { app: "health-tracker", schema_version: v, exported_at: new Date().toISOString(), tables };
}

/** Deletes all logged data. Keeps settings and the exercise list. */
export async function clearAllData(db: Db): Promise<void> {
  for (const t of [...BACKUP_TABLES].reverse()) {
    if (t === "setting" || t === "exercise") continue;
    await db.execute(`DELETE FROM ${t}`);
  }
  await db.flush?.();
}

/** Replaces all data with the backup's contents. */
export async function restoreBackup(db: Db, b: Backup): Promise<number> {
  if (b.app !== "health-tracker" || !b.tables) throw new Error("Not a Health Tracker backup file");
  const [{ v }] = await db.select<{ v: number }>(`SELECT MAX(version) AS v FROM schema_migrations`);
  if (b.schema_version > v) throw new Error(`Backup is from a newer app version (schema ${b.schema_version} > ${v})`);
  for (const t of [...BACKUP_TABLES].reverse()) await db.execute(`DELETE FROM ${t}`);
  let n = 0;
  for (const t of BACKUP_TABLES) {
    for (const row of b.tables[t] ?? []) {
      const cols = Object.keys(row);
      if (!cols.every((c) => /^[a-z_0-9]+$/.test(c))) throw new Error(`Invalid column in ${t}`);
      await db.execute(
        `INSERT INTO ${t} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
        cols.map((c) => row[c]),
      );
      n++;
    }
  }
  await db.flush?.();
  return n;
}
