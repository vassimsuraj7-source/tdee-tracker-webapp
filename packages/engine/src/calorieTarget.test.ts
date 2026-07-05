import { describe, it, expect } from "vitest";
import { calorieTarget } from "./calorieTarget.js";
import { KCAL_PER_KG, CALORIE_TARGET_FLOOR } from "./types.js";

const base = {
  heightCm: 175,
  today: "2026-01-01" as const,
};

describe("calorieTarget", () => {
  it("is undetermined when there is no TDEE (Req 16.5)", () => {
    const r = calorieTarget({
      ...base,
      currentTdee: undefined,
      tdeeSource: "undetermined",
      currentTrendWeightKg: 80,
    });
    expect(r.calorieTarget).toBeUndefined();
    expect(r.tdeeSource).toBe("undetermined");
  });

  it("returns maintenance (TDEE) when there is no goal (Req 16.4)", () => {
    const r = calorieTarget({
      ...base,
      currentTdee: 2500,
      tdeeSource: "data-driven",
      currentTrendWeightKg: 80,
    });
    expect(r.calorieTarget).toBe(2500);
    expect(r.rateCapped).toBe(false);
  });

  it("applies a healthy deficit for a reasonable loss goal", () => {
    // normal-BMI person (68kg/1.75m ~22.2), lose 5kg in 20 weeks = 0.25 kg/wk (exactly permitted)
    const r = calorieTarget({
      ...base,
      currentTdee: 2500,
      tdeeSource: "data-driven",
      currentTrendWeightKg: 68,
      goal: { targetWeightKg: 63, targetDate: "2026-05-21" }, // ~20 weeks out
    });
    // 0.25 kg/wk deficit => (0.25*7700)/7 = 275 kcal/day deficit
    expect(r.calorieTarget!).toBeCloseTo(2500 - 275, 0);
    expect(r.rateCapped).toBe(false);
    expect(r.dateUnachievable).toBe(false);
  });

  it("caps an aggressive loss goal at the healthy rate and flags it (Req 16.2)", () => {
    // wants to lose 10kg in 4 weeks (2.5 kg/wk) but normal BMI permits only 0.25
    const r = calorieTarget({
      ...base,
      currentTdee: 2500,
      tdeeSource: "data-driven",
      currentTrendWeightKg: 68,
      goal: { targetWeightKg: 58, targetDate: "2026-01-29" }, // ~4 weeks
    });
    expect(r.rateCapped).toBe(true);
    expect(r.dateUnachievable).toBe(true);
    // capped at 0.25 kg/wk => 275 kcal deficit, not the ~4800 the raw goal implies
    expect(r.calorieTarget!).toBeCloseTo(2500 - 275, 0);
  });

  it("never recommends below the 1200 kcal floor (Req 16.3)", () => {
    // small TDEE + aggressive permitted loss (obese tier) could push below floor
    const r = calorieTarget({
      ...base,
      currentTdee: 1400,
      tdeeSource: "estimated",
      currentTrendWeightKg: 130, // BMI ~42 => 1.0 kg/wk permitted
      goal: { targetWeightKg: 90, targetDate: "2026-12-31" },
    });
    expect(r.calorieTarget!).toBeGreaterThanOrEqual(CALORIE_TARGET_FLOOR);
  });

  it("refuses a loss goal when underweight and falls back to maintenance (Req 10.4)", () => {
    const r = calorieTarget({
      ...base,
      currentTdee: 2000,
      tdeeSource: "data-driven",
      currentTrendWeightKg: 45, // BMI ~14.7
      goal: { targetWeightKg: 42, targetDate: "2026-06-01" },
    });
    expect(r.calorieTarget).toBe(2000); // maintenance
    expect(r.warning).toBeDefined();
  });

  it("applies a surplus for a healthy gain goal", () => {
    // underweight person gaining: permitted gain = weight*0.005
    const r = calorieTarget({
      ...base,
      currentTdee: 2200,
      tdeeSource: "data-driven",
      currentTrendWeightKg: 50, // BMI ~16.3 => gain permitted
      goal: { targetWeightKg: 60, targetDate: "2026-12-31" },
    });
    expect(r.calorieTarget!).toBeGreaterThan(2200); // surplus
  });

  it("treats a past target date as unachievable and caps the rate", () => {
    const r = calorieTarget({
      ...base,
      currentTdee: 2500,
      tdeeSource: "data-driven",
      currentTrendWeightKg: 80, // BMI ~26 => 0.35 permitted loss
      goal: { targetWeightKg: 75, targetDate: "2025-12-01" }, // in the past
    });
    expect(r.dateUnachievable).toBe(true);
    expect(r.rateCapped).toBe(true);
    // capped at 0.35 kg/wk deficit
    expect(r.calorieTarget!).toBeCloseTo(2500 - (0.35 * KCAL_PER_KG) / 7, 0);
  });
});
