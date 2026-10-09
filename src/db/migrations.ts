import type { Db } from "./types";

/**
 * Ordered schema migrations. Never edit a shipped migration; append a new one.
 * Conventions: times in UTC ISO-8601 plus an IANA timezone, metric units,
 * local calendar dates as YYYY-MM-DD.
 */
export const MIGRATIONS: { version: number; name: string; statements: string[] }[] = [
  {
    version: 1,
    name: "initial schema",
    statements: [
      `CREATE TABLE import_source (
        id INTEGER PRIMARY KEY,
        kind TEXT NOT NULL,
        file_path TEXT,
        file_hash TEXT,
        external_id TEXT,
        imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      )`,
      `CREATE UNIQUE INDEX import_source_hash ON import_source(file_hash) WHERE file_hash IS NOT NULL`,

      `CREATE TABLE activity (
        id INTEGER PRIMARY KEY,
        sport TEXT NOT NULL,
        start_utc TEXT NOT NULL,
        tz TEXT NOT NULL,
        duration_s REAL NOT NULL,
        moving_s REAL,
        distance_m REAL,
        elevation_gain_m REAL,
        avg_hr REAL,
        max_hr REAL,
        kcal REAL,
        name TEXT,
        notes TEXT,
        source_id INTEGER REFERENCES import_source(id) ON DELETE SET NULL
      )`,
      `CREATE INDEX activity_start ON activity(start_utc)`,
      `CREATE INDEX activity_sport_start ON activity(sport, start_utc)`,
      `CREATE TABLE activity_lap (
        id INTEGER PRIMARY KEY,
        activity_id INTEGER NOT NULL REFERENCES activity(id) ON DELETE CASCADE,
        idx INTEGER NOT NULL,
        start_utc TEXT,
        duration_s REAL,
        distance_m REAL,
        avg_hr REAL,
        avg_power_w REAL,
        avg_cadence REAL
      )`,
      `CREATE TABLE activity_stream (
        activity_id INTEGER PRIMARY KEY REFERENCES activity(id) ON DELETE CASCADE,
        format TEXT NOT NULL,
        data BLOB NOT NULL
      )`,
      `CREATE TABLE swim_detail (
        activity_id INTEGER PRIMARY KEY REFERENCES activity(id) ON DELETE CASCADE,
        pool_length_m REAL,
        stroke TEXT,
        swolf REAL,
        open_water INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE TABLE ride_detail (
        activity_id INTEGER PRIMARY KEY REFERENCES activity(id) ON DELETE CASCADE,
        avg_power_w REAL,
        normalized_power_w REAL,
        ftp_at_time REAL,
        indoor INTEGER NOT NULL DEFAULT 0
      )`,

      `CREATE TABLE exercise (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        category TEXT NOT NULL DEFAULT 'barbell',
        primary_muscles TEXT,
        aliases TEXT NOT NULL DEFAULT '[]'
      )`,
      `CREATE TABLE workout (
        id INTEGER PRIMARY KEY,
        start_utc TEXT NOT NULL,
        tz TEXT NOT NULL,
        duration_s REAL,
        name TEXT,
        notes TEXT,
        source_id INTEGER REFERENCES import_source(id) ON DELETE SET NULL
      )`,
      `CREATE INDEX workout_start ON workout(start_utc)`,
      `CREATE TABLE workout_set (
        id INTEGER PRIMARY KEY,
        workout_id INTEGER NOT NULL REFERENCES workout(id) ON DELETE CASCADE,
        exercise_id INTEGER NOT NULL REFERENCES exercise(id),
        set_idx INTEGER NOT NULL,
        reps INTEGER,
        weight_kg REAL,
        rpe REAL,
        set_type TEXT NOT NULL DEFAULT 'working',
        duration_s REAL,
        distance_m REAL
      )`,
      `CREATE INDEX workout_set_workout ON workout_set(workout_id)`,
      `CREATE INDEX workout_set_exercise ON workout_set(exercise_id)`,

      `CREATE TABLE food (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        brand TEXT,
        kcal_100g REAL NOT NULL,
        protein_100g REAL NOT NULL DEFAULT 0,
        carbs_100g REAL NOT NULL DEFAULT 0,
        fat_100g REAL NOT NULL DEFAULT 0,
        fiber_100g REAL,
        serving_g REAL
      )`,
      `CREATE TABLE food_entry (
        id INTEGER PRIMARY KEY,
        date TEXT NOT NULL,
        meal TEXT NOT NULL,
        food_id INTEGER REFERENCES food(id) ON DELETE SET NULL,
        description TEXT,
        quantity_g REAL,
        kcal REAL NOT NULL,
        protein_g REAL NOT NULL DEFAULT 0,
        carbs_g REAL NOT NULL DEFAULT 0,
        fat_g REAL NOT NULL DEFAULT 0,
        source_id INTEGER REFERENCES import_source(id) ON DELETE SET NULL
      )`,
      `CREATE INDEX food_entry_date ON food_entry(date)`,
      `CREATE TABLE nutrition_target (
        valid_from TEXT PRIMARY KEY,
        kcal REAL NOT NULL,
        protein_g REAL NOT NULL,
        carbs_g REAL NOT NULL,
        fat_g REAL NOT NULL
      )`,

      `CREATE TABLE body_measurement (
        id INTEGER PRIMARY KEY,
        time_utc TEXT NOT NULL,
        type TEXT NOT NULL,
        value REAL NOT NULL,
        unit TEXT NOT NULL,
        source_id INTEGER REFERENCES import_source(id) ON DELETE SET NULL
      )`,
      `CREATE INDEX body_measurement_type_time ON body_measurement(type, time_utc)`,

      `CREATE TABLE setting (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,
    ],
  },
];

/** Exercises available out of the box so the lift log is usable immediately. */
export const SEED_EXERCISES: [name: string, category: string, muscles: string][] = [
  ["Back Squat", "barbell", "quads,glutes"],
  ["Front Squat", "barbell", "quads"],
  ["Deadlift", "barbell", "hamstrings,glutes,back"],
  ["Romanian Deadlift", "barbell", "hamstrings,glutes"],
  ["Bench Press", "barbell", "chest,triceps"],
  ["Incline Bench Press", "barbell", "chest,shoulders"],
  ["Overhead Press", "barbell", "shoulders,triceps"],
  ["Barbell Row", "barbell", "back,biceps"],
  ["Pull-up", "bodyweight", "back,biceps"],
  ["Chin-up", "bodyweight", "back,biceps"],
  ["Dip", "bodyweight", "chest,triceps"],
  ["Dumbbell Bench Press", "dumbbell", "chest"],
  ["Dumbbell Shoulder Press", "dumbbell", "shoulders"],
  ["Lat Pulldown", "machine", "back"],
  ["Leg Press", "machine", "quads,glutes"],
  ["Hip Thrust", "barbell", "glutes"],
  ["Bicep Curl", "dumbbell", "biceps"],
  ["Tricep Pushdown", "cable", "triceps"],
  ["Lateral Raise", "dumbbell", "shoulders"],
  ["Plank", "bodyweight", "core"],
];

export async function migrate(db: Db): Promise<number> {
  await db.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`);
  const rows = await db.select<{ v: number | null }>(`SELECT MAX(version) AS v FROM schema_migrations`);
  const current = rows[0]?.v ?? 0;
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    for (const s of m.statements) await db.execute(s);
    if (m.version === 1) {
      for (const [name, category, muscles] of SEED_EXERCISES) {
        await db.execute(`INSERT INTO exercise (name, category, primary_muscles) VALUES (?, ?, ?)`, [name, category, muscles]);
      }
    }
    await db.execute(`INSERT INTO schema_migrations (version, name) VALUES (?, ?)`, [m.version, m.name]);
  }
  await db.flush?.();
  return MIGRATIONS[MIGRATIONS.length - 1].version;
}
