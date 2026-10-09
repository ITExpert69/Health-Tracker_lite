# Health Tracker

A personal, local-first desktop app for nutrition, body weight, lifting, runs, rides and swims.
All data lives in one SQLite file on your machine. There is no account, no server and no cloud.

**Status: MVP 1 (roadmap phase 1, "Foundation").** Manual entry for every module, dashboards, JSON backup/restore.
File importers (Garmin/Strava/FIT/GPX/TCX, then Strong/Hevy/nutrition CSVs) are phases 2 and 3.

## Run it

Prerequisites:

- Node.js 20+
- Rust (stable) via [rustup](https://rustup.rs)
- The Tauri system dependencies for your OS: <https://tauri.app/start/prerequisites/>
  (macOS: Xcode Command Line Tools · Windows: WebView2 + MSVC build tools · Linux: `libwebkit2gtk-4.1-dev` and friends)

```bash
npm install
npm run tauri dev      # desktop app with hot reload
npm run tauri build    # installer / app bundle in src-tauri/target/release/bundle/
```

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run dev` | UI only, in a browser at http://localhost:1420. Data goes to the browser's IndexedDB (via sql.js), which is handy for UI work |
| `npm test` | Unit tests for the data layer and stats (Vitest, real SQLite via sql.js) |
| `npm run typecheck` | TypeScript check |

To try the app with data: **Settings & data → Load demo data** (shown only while the database is empty).
It adds 120 days of sample history. **Delete all data** removes it again.

## Where your data is

`health.db` in the app's config directory:

- macOS: `~/Library/Application Support/com.personal.healthtracker/`
- Windows: `%APPDATA%\com.personal.healthtracker\`
- Linux: `~/.config/com.personal.healthtracker/`

**Settings & data → Export backup** writes a single JSON file containing everything. **Restore** replaces all data with a backup's contents.

## What's in MVP 1

- **Dashboard**: training hours per week by sport (8 weeks), today's kcal and macros vs target, weight trend (90 days), recent sessions.
- **Nutrition**: day-by-day log by meal; add from your food library (per 100 g) or quick-add totals; meters against targets; 28-day kcal chart.
  Targets are versioned by date, so past days are judged against the target in force at the time.
- **Weight**: weigh-ins with a smoothed trend (exponential moving average, time-aware across gaps), 28-day rate per week, goal line.
- **Lifts**: workout editor (exercise → sets with type, reps, load, RPE); estimated 1RM chart per exercise (Epley); 1/3/5/8/10 rep-max PR board; weekly volume.
- **Runs / rides / swims**: manual sessions with duration, distance, HR, elevation, kcal; ride power and indoor flag; swim pool length, stroke and open water; weekly distance chart; pace/speed in sport-appropriate units.
- **Units**: metric or imperial. Storage is always metric.

## Architecture

```
src/
  db/
    migrations.ts   versioned schema (+ seed exercises); append-only
    repo.ts         every query lives here, behind a small Db interface
    tauri.ts        Db over tauri-plugin-sql (desktop)
    sqljs.ts        Db over sql.js (browser dev mode + tests)
  lib/              dates, units, stats (1RM, weight trend), demo data, backup file IO
  components/       UI primitives and the ECharts wrapper (light/dark tokens)
  pages/            Dashboard, Nutrition, Weight, Lifts, Activities (run/ride/swim), Settings
src-tauri/          Rust shell: SQLite, dialog and fs plugins. Phase 2 parsers go here
test/               Vitest suites
```

The schema already includes the tables later phases need: `import_source` (provenance, dedupe by file hash),
`activity_lap`, `activity_stream`, and `source_id` on every record. Importers can then be added without migrations.

## Next phases

1. **Phase 2: endurance history.** FIT/GPX/TCX parsers in Rust; Garmin and Strava bulk-export import; cross-source dedupe; maps, splits and best efforts.
2. **Phase 3: lifts and nutrition import.** Strong/Hevy CSV, nutrition-app CSV (MyFitnessPal / Cronometer / MacroFactor), and a spreadsheet column mapper.
3. **Phase 4: automation.** Watched folder, Strava API sync, scheduled backups, training load.
