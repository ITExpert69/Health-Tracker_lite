/** Local calendar date (YYYY-MM-DD) for a Date in the runtime's timezone. */
export function localDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function localTz(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/** Parses YYYY-MM-DD as a local-midnight Date. */
export function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  const d = parseLocalDate(s);
  d.setDate(d.getDate() + n);
  return localDate(d);
}

/** Monday of the ISO week containing the given local date. */
export function weekStart(s: string): string {
  const d = parseLocalDate(s);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  return addDays(s, -dow);
}

/** Value for <input type="datetime-local"> from an ISO UTC string. */
export function toDateTimeLocal(iso: string): string {
  const d = new Date(iso);
  return `${localDate(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** ISO UTC string from an <input type="datetime-local"> value (interpreted locally). */
export function fromDateTimeLocal(v: string): string {
  return new Date(v).toISOString();
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  const d = iso.length === 10 ? parseLocalDate(iso) : new Date(iso);
  return d.toLocaleDateString(undefined, opts);
}
