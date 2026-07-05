import { describe, it, expect } from "vitest";
import {
  findValidWindows,
  calculateWindowTdee,
  computeWindowTdees,
  toValidCalorieMap,
  type Window,
} from "./rollingWindow.js";
import { fillMissingWeightData } from "./trendWeight.js";
import { enumerateDays } from "./date.js";
import type { DatedValue } from "./types.js";

/** Helper: build calorie entries for a contiguous day range with a constant value. */
function constantCalories(start: string, end: string, value: number): DatedValue[] {
  return enumerateDays(start, end).map((date) => ({ date, value }));
}

describe("findValidWindows", () => {
  it("returns no windows when there is no calorie data", () => {
    expect(findValidWindows(new Map(), "2026-07-13")).toEqual([]);
  });

  it("finds a window when >=7 of 12 days have calories", () => {
    // 12 consecutive days ending on 'today', all logged
    const cals = toValidCalorieMap(constantCalories("2026-07-02", "2026-07-13", 2000));
    const windows = findValidWindows(cals, "2026-07-13");
    expect(windows.length).toBeGreaterThanOrEqual(1);
    // most recent window first, spanning exactly 12 days
    expect(windows[0]).toEqual<Window>({ start: "2026-07-02", end: "2026-07-13" });
  });

  it("excludes windows with fewer than 7 valid days (Req 11.3)", () => {
    // only 6 logged days inside the most recent 12-day window
    const cals = toValidCalorieMap(constantCalories("2026-07-08", "2026-07-13", 2000));
    const windows = findValidWindows(cals, "2026-07-13");
    // the current 12-day window has only 6 valid days -> not recorded
    const current = windows.find((w) => w.end === "2026-07-13");
    expect(current).toBeUndefined();
  });
});

describe("calculateWindowTdee", () => {
  const window: Window = { start: "2026-07-02", end: "2026-07-13" };

  it("computes TDEE with stable weight (no weight change => TDEE == avg intake)", () => {
    const cals = toValidCalorieMap(constantCalories("2026-07-02", "2026-07-13", 2500));
    // constant weight => trend delta 0 => TDEE = total/12 = 2500
    const weights = fillMissingWeightData(
      enumerateDays("2026-06-26", "2026-07-13").map((date) => ({ date, value: 80 })),
      "2026-06-26",
      "2026-07-13",
    );
    const result = calculateWindowTdee(window, cals, weights);
    expect(result).not.toBeNull();
    expect(result!.tdee).toBeCloseTo(2500, 6);
    expect(result!.validDays).toBe(12);
  });

  it("subtracts stored energy when weight rises (surplus => TDEE below intake)", () => {
    const cals = toValidCalorieMap(constantCalories("2026-07-02", "2026-07-13", 2500));
    // weight rises 1kg across the window's trend endpoints
    const raw: DatedValue[] = enumerateDays("2026-06-26", "2026-07-13").map((date, i) => ({
      date,
      value: 80 + i * 0.1, // steady rise
    }));
    const weights = fillMissingWeightData(raw, "2026-06-26", "2026-07-13");
    const result = calculateWindowTdee(window, cals, weights);
    expect(result).not.toBeNull();
    // gaining weight => actual expenditure is less than intake
    expect(result!.tdee).toBeLessThan(2500);
  });

  it("imputes missing calorie days with the window average (Req 12)", () => {
    // 8 logged days at 2000, 4 missing; average is 2000, so imputed total = 12*2000
    const logged = enumerateDays("2026-07-02", "2026-07-09").map((date) => ({ date, value: 2000 }));
    const cals = toValidCalorieMap(logged);
    const weights = fillMissingWeightData(
      enumerateDays("2026-06-26", "2026-07-13").map((date) => ({ date, value: 80 })),
      "2026-06-26",
      "2026-07-13",
    );
    const result = calculateWindowTdee(window, cals, weights);
    expect(result).not.toBeNull();
    expect(result!.tdee).toBeCloseTo(2000, 6);
    expect(result!.validDays).toBe(8);
  });

  it("returns null when the window has fewer than 7 valid days", () => {
    const cals = toValidCalorieMap(constantCalories("2026-07-08", "2026-07-13", 2000)); // 6 days
    const weights = fillMissingWeightData(
      enumerateDays("2026-06-26", "2026-07-13").map((date) => ({ date, value: 80 })),
      "2026-06-26",
      "2026-07-13",
    );
    expect(calculateWindowTdee(window, cals, weights)).toBeNull();
  });

  it("returns null when trend weight is undetermined (Req 11.6)", () => {
    const cals = toValidCalorieMap(constantCalories("2026-07-02", "2026-07-13", 2000));
    // only one weight point => trend windows can't reach 7 filled days at the start
    const weights = fillMissingWeightData(
      [{ date: "2026-07-13", value: 80 }],
      "2026-07-13",
      "2026-07-13",
    );
    expect(calculateWindowTdee(window, cals, weights)).toBeNull();
  });
});

describe("computeWindowTdees", () => {
  it("returns current + ascending history", () => {
    const cals = constantCalories("2026-06-20", "2026-07-13", 2200);
    const weights = enumerateDays("2026-06-14", "2026-07-13").map((date) => ({ date, value: 75 }));
    const series = computeWindowTdees(weights, cals, "2026-07-13");
    expect(series.current).not.toBeNull();
    expect(series.current!.tdee).toBeCloseTo(2200, 6);
    // history ascending by end date
    for (let i = 1; i < series.history.length; i++) {
      expect(series.history[i]!.window.end >= series.history[i - 1]!.window.end).toBe(true);
    }
    // current is the latest end date
    const lastEnd = series.history[series.history.length - 1]!.window.end;
    expect(series.current!.window.end).toBe(lastEnd);
  });

  it("returns empty series when insufficient data", () => {
    const series = computeWindowTdees([], [], "2026-07-13");
    expect(series.current).toBeNull();
    expect(series.history).toEqual([]);
  });
});
