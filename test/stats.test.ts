import { describe, expect, it } from "vitest";
import { epley1RM, weightTrend, weeklyRate, macroKcal } from "../src/lib/stats";
import { addDays, weekStart } from "../src/lib/dates";
import { formatDuration, formatSpeed, parseDuration, displayToKg, kgToDisplay } from "../src/lib/units";

describe("stats", () => {
  it("epley 1RM", () => {
    expect(epley1RM(100, 1)).toBe(100);
    expect(epley1RM(100, 5)).toBeCloseTo(116.67, 2);
    expect(epley1RM(100, 0)).toBe(0);
  });

  it("weight trend averages same-day weigh-ins and smooths over gaps", () => {
    const t = weightTrend([
      { date: "2026-01-01", value: 80 },
      { date: "2026-01-02", value: 79 },
      { date: "2026-01-02", value: 81 },
      { date: "2026-01-04", value: 78 },
    ]);
    expect(t.map((p) => p.date)).toEqual(["2026-01-01", "2026-01-02", "2026-01-04"]);
    expect(t[1].value).toBeCloseTo(80); // day avg 80, trend stays 80
    // two-day gap: 78 + (80-78)*0.9^2
    expect(t[2].value).toBeCloseTo(78 + 2 * 0.81);
  });

  it("weekly rate from a linear trend", () => {
    const pts = Array.from({ length: 29 }, (_, i) => ({ date: addDays("2026-01-01", i), value: 80 - i * 0.1 }));
    expect(weeklyRate(pts)).toBeCloseTo(-0.7, 5);
    expect(weeklyRate(pts.slice(0, 1))).toBeNull();
  });

  it("macro kcal", () => expect(macroKcal(10, 10, 10)).toBe(170));
});

describe("dates and units", () => {
  it("week starts Monday", () => {
    expect(weekStart("2026-10-09")).toBe("2026-10-05"); // Friday -> Monday
    expect(weekStart("2026-10-05")).toBe("2026-10-05");
    expect(weekStart("2026-10-11")).toBe("2026-10-05"); // Sunday
  });

  it("durations", () => {
    expect(formatDuration(3725)).toBe("1:02:05");
    expect(formatDuration(305)).toBe("5:05");
    expect(parseDuration("1:02:05")).toBe(3725);
    expect(parseDuration("45")).toBe(2700);
    expect(parseDuration("abc")).toBeNaN();
  });

  it("speeds", () => {
    expect(formatSpeed("run", 10000, 3000, "metric")).toBe("5:00 /km");
    expect(formatSpeed("ride", 30000, 3600, "metric")).toBe("30.0 km/h");
    expect(formatSpeed("swim", 1000, 1200, "metric")).toBe("2:00 /100m");
  });

  it("mass round-trip", () => {
    expect(displayToKg(kgToDisplay(80, "imperial"), "imperial")).toBeCloseTo(80);
  });
});

import { backupOverdue } from "../src/lib/backup";
describe("backup reminder", () => {
  it("is overdue when never backed up or older than 7 days", () => {
    const now = Date.parse("2026-10-09T12:00:00Z");
    expect(backupOverdue(null, now)).toBe(true);
    expect(backupOverdue("2026-10-05T12:00:00Z", now)).toBe(false);
    expect(backupOverdue("2026-10-01T12:00:00Z", now)).toBe(true);
  });
});
