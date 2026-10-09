/** Epley estimated one-rep max. Returns the load itself for single reps. */
export function epley1RM(weightKg: number, reps: number): number {
  if (reps <= 0 || weightKg <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

export interface DatedValue {
  date: string; // YYYY-MM-DD
  value: number;
}

/**
 * Exponentially smoothed weight trend (as popularized by "The Hacker's Diet").
 * Multiple weigh-ins on one day are averaged first. Missing days are carried
 * forward so the smoothing is time-aware: alpha is applied once per calendar day.
 */
export function weightTrend(points: DatedValue[], alpha = 0.1): DatedValue[] {
  if (!points.length) return [];
  const byDay = new Map<string, { sum: number; n: number }>();
  for (const p of points) {
    const e = byDay.get(p.date) ?? { sum: 0, n: 0 };
    e.sum += p.value;
    e.n += 1;
    byDay.set(p.date, e);
  }
  const days = [...byDay.keys()].sort();
  const out: DatedValue[] = [];
  let trend = byDay.get(days[0])!.sum / byDay.get(days[0])!.n;
  let prev = days[0];
  out.push({ date: prev, value: trend });
  for (const day of days.slice(1)) {
    const gap = Math.max(1, Math.round((Date.parse(day) - Date.parse(prev)) / 864e5));
    const e = byDay.get(day)!;
    const v = e.sum / e.n;
    // Equivalent to applying the daily update `gap` times with the value held constant.
    trend = v + (trend - v) * Math.pow(1 - alpha, gap);
    out.push({ date: day, value: trend });
    prev = day;
  }
  return out;
}

/** Change per week of a trend over the trailing `days` window, from a least-squares slope. */
export function weeklyRate(trend: DatedValue[], days = 28): number | null {
  if (trend.length < 2) return null;
  const last = Date.parse(trend[trend.length - 1].date);
  const pts = trend.filter((p) => last - Date.parse(p.date) <= days * 864e5);
  if (pts.length < 2) return null;
  const xs = pts.map((p) => (Date.parse(p.date) - last) / 864e5);
  const ys = pts.map((p) => p.value);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den ? (num / den) * 7 : null;
}

/** kcal implied by macros (4/4/9). */
export const macroKcal = (p: number, c: number, f: number) => p * 4 + c * 4 + f * 9;
