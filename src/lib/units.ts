export type UnitSystem = "metric" | "imperial";

export const KG_PER_LB = 0.45359237;
export const M_PER_MI = 1609.344;

export function kgToDisplay(kg: number, u: UnitSystem): number {
  return u === "metric" ? kg : kg / KG_PER_LB;
}
export function displayToKg(v: number, u: UnitSystem): number {
  return u === "metric" ? v : v * KG_PER_LB;
}
export const massUnit = (u: UnitSystem) => (u === "metric" ? "kg" : "lb");

export function mToDisplayDistance(m: number, u: UnitSystem): number {
  return u === "metric" ? m / 1000 : m / M_PER_MI;
}
export function displayDistanceToM(v: number, u: UnitSystem): number {
  return u === "metric" ? v * 1000 : v * M_PER_MI;
}
export const distUnit = (u: UnitSystem) => (u === "metric" ? "km" : "mi");

/** h:mm:ss or m:ss */
export function formatDuration(totalS: number): string {
  const s = Math.round(totalS);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

/** Compact hours, e.g. "5h 20m". */
export function formatHours(totalS: number): string {
  const m = Math.round(totalS / 60);
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m`;
}

/** Parses "h:mm:ss", "mm:ss" or plain minutes into seconds. Returns NaN when invalid. */
export function parseDuration(v: string): number {
  const t = v.trim();
  if (!t) return NaN;
  if (!t.includes(":")) return Number(t) * 60;
  const parts = t.split(":").map(Number);
  if (parts.some((p) => !Number.isFinite(p) || p < 0)) return NaN;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

export type Sport = "run" | "ride" | "swim";

/** Sport-appropriate speed: pace per km/mi (run), km/h or mph (ride), pace per 100 m/yd (swim). */
export function formatSpeed(sport: Sport, distanceM: number, durationS: number, u: UnitSystem): string {
  if (!distanceM || !durationS) return "–";
  if (sport === "ride") {
    const v = mToDisplayDistance(distanceM, u) / (durationS / 3600);
    return `${v.toFixed(1)} ${u === "metric" ? "km/h" : "mph"}`;
  }
  if (sport === "swim") {
    const per = u === "metric" ? 100 : 91.44;
    return `${formatDuration((durationS / distanceM) * per)} /100${u === "metric" ? "m" : "yd"}`;
  }
  return `${formatDuration(durationS / mToDisplayDistance(distanceM, u))} /${distUnit(u)}`;
}

/** Distance in the sport's natural unit: metres/yards for swims, km/mi otherwise. */
export function formatDistance(sport: Sport, distanceM: number | null, u: UnitSystem): string {
  if (distanceM == null) return "–";
  if (sport === "swim") return u === "metric" ? `${Math.round(distanceM).toLocaleString()} m` : `${Math.round(distanceM / 0.9144).toLocaleString()} yd`;
  const v = mToDisplayDistance(distanceM, u);
  return `${v >= 1000 ? Math.round(v).toLocaleString() : v.toFixed(v >= 100 ? 1 : 2)} ${distUnit(u)}`;
}

export const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
