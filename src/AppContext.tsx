import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { getDb } from "./db";
import type { Db } from "./db/types";
import { getSettings, saveSettings, type Settings } from "./db/repo";

interface Ctx {
  db: Db;
  settings: Settings;
  updateSettings: (p: Partial<Settings>) => Promise<void>;
  /** Bumped after any write so views reload. */
  version: number;
  changed: () => void;
}

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Db | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    getDb()
      .then(async (d) => {
        setSettings(await getSettings(d));
        setDb(d);
      })
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);

  const changed = useCallback(() => setVersion((v) => v + 1), []);
  const updateSettings = useCallback(
    async (p: Partial<Settings>) => {
      if (!db) return;
      await saveSettings(db, p);
      setSettings(await getSettings(db));
      changed();
    },
    [db, changed],
  );

  if (error) return <div className="p-8 text-critical">Could not open the database: {error}</div>;
  if (!db || !settings) return <div className="p-8 text-muted">Opening database…</div>;
  return <AppCtx.Provider value={{ db, settings, updateSettings, version, changed }}>{children}</AppCtx.Provider>;
}

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside AppProvider");
  return c;
}

/** Runs a loader against the db; re-runs when data changes or deps change. */
export function useQuery<T>(load: (db: Db) => Promise<T>, deps: unknown[] = []): T | undefined {
  const { db, version } = useApp();
  const [data, setData] = useState<T>();
  useEffect(() => {
    let live = true;
    load(db).then((d) => live && setData(d));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, version, ...deps]);
  return data;
}
