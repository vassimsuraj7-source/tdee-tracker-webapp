import { describe, it, expect } from "vitest";
import { calorieTarget } from "./calorieTarget.js";
import { permittedWeeklyChangeKg } from "./guardrails.js";
import { findValidWindows, computeWindowTdees, toValidCalorieMap } from "./rollingWindow.js";
import { CALORIE_TARGET_FLOOR, KCAL_PER_KG, type DatedValue, type TdeeSource } from "./types.js";
import { addDays, diffDays, enumerateDays } from "./date.js";

/** Deterministic PRNG (mulberry32) so property runs are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CASES = 2000;
const EPS = 1e-6;

describe("Property 4: calorie-target floor and rate cap (Req 16.2, 16.3)", () => {
  it("never recommends below 1200 kcal, and respects the healthy weekly rate", () => {
    const rand = mulberry32(0xc0ffee);
    const today = "2026-01-01";
    const sources: TdeeSource[] = ["data-driven", "estimated"];

    for (let i = 0; i < CASES; i++) {
      const currentTdee = 1500 + rand() * 2500; // 1500..4000
      const currentTrendWeightKg = 40 + rand() * 120; // 40..160
      const heightCm = 145 + rand() * 60; // 145..205
      const targetWeightKg = 40 + rand() * 120; // 40..160
      const dayOffset = Math.floor(rand() * 430) - 30; // -30..400 days
      const targetDate = addDays(today, dayOffset);
      const tdeeSource = sources[Math.floor(rand() * sources.length)]!;

      const r = calorieTarget({
        currentTdee,
        tdeeSource,
        currentTrendWeightKg,
        heightCm,
        goal: { targetWeightKg, targetDate },
        today,
      });

      // Floor invariant always holds.
      expect(r.calorieTarget).toBeDefined();
      expect(r.calorieTarget!).toBeGreaterThanOrEqual(CALORIE_TARGET_FLOOR);

      // Rate-cap invariant: when the floor did not bind (target strictly above the
      // floor), the implied weekly change must not exceed the permitted rate.
      if (r.calorieTarget! > CALORIE_TARGET_FLOOR + EPS && !r.warning) {
        const permitted = permittedWeeklyChangeKg(currentTrendWeightKg, heightCm);
        const impliedWeeklyKg = ((r.calorieTarget! - currentTdee) * 7) / KCAL_PER_KG;
        if (impliedWeeklyKg < 0) {
          expect(Math.abs(impliedWeeklyKg)).toBeLessThanOrEqual(permitted.loss + 1e-3);
        } else {
          expect(impliedWeeklyKg).toBeLessThanOrEqual(permitted.gain + 1e-3);
        }
      }
    }
  });
});

describe("Property 6: window validity (Req 11)", () => {
  it("every returned window spans 12 days with >=7 valid calorie days", () => {
    const rand = mulberry32(0x1234abcd);
    const today = "2026-03-01";

    for (let i = 0; i < 300; i++) {
      // Random calorie log: each day in a ~60-day span present with prob p.
      const spanStart = addDays(today, -59);
      const p = 0.4 + rand() * 0.6; // 0.4..1.0 density
      const calories: DatedValue[] = [];
      for (const date of enumerateDays(spanStart, today)) {
        if (rand() < p) calories.push({ date, value: 1500 + rand() * 1500 });
      }
      const caloriesByDay = toValidCalorieMap(calories);
      const windows = findValidWindows(caloriesByDay, today);

      for (const w of windows) {
        expect(diffDays(w.start, w.end)).toBe(11); // 12 inclusive days
        const validCount = enumerateDays(w.start, w.end).reduce(
          (n, d) => n + (caloriesByDay.has(d) ? 1 : 0),
          0,
        );
        expect(validCount).toBeGreaterThanOrEqual(7);
      }

      // Every computed history entry also reports >=7 valid days.
      const weights = enumerateDays(addDays(spanStart, -6), today).map((date) => ({
        date,
        value: 70 + rand() * 20,
      }));
      const series = computeWindowTdees(weights, calories, today);
      for (const h of series.history) {
        expect(h.validDays).toBeGreaterThanOrEqual(7);
        expect(Number.isFinite(h.tdee)).toBe(true);
      }
    }
  });
});
