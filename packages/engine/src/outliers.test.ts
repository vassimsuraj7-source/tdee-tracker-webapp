import { describe, it, expect } from "vitest";
import { detectWeightOutliers } from "./outliers.js";

/** Build a run of daily weights around a base with small noise, then splice edits. */
function series(base: number, days: number): { date: string; value: number }[] {
  const out: { date: string; value: number }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.UTC(2026, 0, 1 + i));
    const iso = d.toISOString().slice(0, 10);
    out.push({ date: iso, value: base + (i % 2 === 0 ? 0.4 : -0.4) }); // ±0.4 kg jitter
  }
  return out;
}

describe("detectWeightOutliers", () => {
  it("does not flag normal day-to-day fluctuation", () => {
    expect(detectWeightOutliers(series(82, 20))).toHaveLength(0);
  });

  it("flags a grossly wrong entry (e.g. 50 kg for an 82 kg person)", () => {
    const s = series(82, 20);
    s[10] = { date: s[10]!.date, value: 50 };
    const out = detectWeightOutliers(s);
    expect(out).toHaveLength(1);
    expect(out[0]!.value).toBe(50);
    expect(Math.round(out[0]!.expected)).toBe(82);
    expect(out[0]!.deltaKg).toBeLessThan(0);
  });

  it("does not flag when there are too few neighbours", () => {
    const s = [
      { date: "2026-01-01", value: 82 },
      { date: "2026-01-02", value: 50 },
    ];
    expect(detectWeightOutliers(s)).toHaveLength(0);
  });

  it("ignores a ~2 kg water swing", () => {
    const s = series(82, 20);
    s[10] = { date: s[10]!.date, value: 84 };
    expect(detectWeightOutliers(s)).toHaveLength(0);
  });
});
