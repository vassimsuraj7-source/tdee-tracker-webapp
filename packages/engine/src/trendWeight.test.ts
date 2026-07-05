import { describe, it, expect } from "vitest";
import { fillMissingWeightData, trendWeight, trendWeightPartial, computeTrendWeight } from "./trendWeight.js";
import type { DatedValue } from "./types.js";

describe("trendWeightPartial (display expanding window)", () => {
  const filled: DatedValue[] = [
    { date: "2026-07-01", value: 80 },
    { date: "2026-07-02", value: 82 },
    { date: "2026-07-03", value: 81 },
  ];
  it("is undefined on the first day (fewer than minDays)", () => {
    expect(trendWeightPartial(filled, "2026-07-01", 7, 2)).toBeUndefined();
  });
  it("averages the available days once minDays is met", () => {
    expect(trendWeightPartial(filled, "2026-07-02", 7, 2)).toBe(81); // (80+82)/2
    expect(trendWeightPartial(filled, "2026-07-03", 7, 2)).toBe(81); // (80+82+81)/3
  });
  it("strict trendWeight stays undefined until a full window", () => {
    expect(trendWeight(filled, "2026-07-03", 7)).toBeUndefined();
  });
});

describe("fillMissingWeightData", () => {
  it("returns empty for empty input", () => {
    expect(fillMissingWeightData([], "2026-07-01", "2026-07-07")).toEqual([]);
  });

  it("keeps recorded days unchanged", () => {
    const raw: DatedValue[] = [
      { date: "2026-07-01", value: 80 },
      { date: "2026-07-02", value: 81 },
    ];
    const filled = fillMissingWeightData(raw, "2026-07-01", "2026-07-02");
    expect(filled).toEqual(raw);
  });

  it("linearly interpolates a two-sided gap (Req 13.2)", () => {
    const raw: DatedValue[] = [
      { date: "2026-07-01", value: 80 },
      { date: "2026-07-05", value: 84 }, // +4 kg over 4 days => +1/day
    ];
    const filled = fillMissingWeightData(raw, "2026-07-01", "2026-07-05");
    expect(filled.map((e) => e.value)).toEqual([80, 81, 82, 83, 84]);
  });

  it("carries the single nearest value for one-sided gaps (Req 13.3)", () => {
    const raw: DatedValue[] = [{ date: "2026-07-03", value: 75 }];
    const filled = fillMissingWeightData(raw, "2026-07-01", "2026-07-05");
    // days before the only known day carry it back; days after carry it forward
    expect(filled.map((e) => e.value)).toEqual([75, 75, 75, 75, 75]);
  });
});

describe("trendWeight", () => {
  it("averages the 7-day window ending on the date", () => {
    const raw: DatedValue[] = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-07-0${i + 1}`,
      value: 70 + i, // 70..76
    }));
    const filled = fillMissingWeightData(raw, "2026-07-01", "2026-07-07");
    // mean(70..76) = 73
    expect(trendWeight(filled, "2026-07-07", 7)).toBeCloseTo(73, 6);
  });

  it("returns undefined when fewer than window days are available (Req 13.4)", () => {
    const raw: DatedValue[] = [
      { date: "2026-07-06", value: 70 },
      { date: "2026-07-07", value: 71 },
    ];
    const filled = fillMissingWeightData(raw, "2026-07-06", "2026-07-07");
    // window ending 2026-07-07 needs 7 days back to 2026-07-01, only 2 available
    expect(trendWeight(filled, "2026-07-07", 7)).toBeUndefined();
  });

  it("computeTrendWeight fills and averages with interpolation", () => {
    const raw: DatedValue[] = [
      { date: "2026-07-01", value: 80 },
      { date: "2026-07-07", value: 86 }, // +1/day interpolated => 80..86
    ];
    // mean(80,81,82,83,84,85,86) = 83
    expect(computeTrendWeight(raw, "2026-07-07", 7)).toBeCloseTo(83, 6);
  });
});
