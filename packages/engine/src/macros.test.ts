import { describe, it, expect } from "vitest";
import { macroTargets, deriveMacroMode } from "./macros.js";

describe("deriveMacroMode", () => {
  it("classifies deficit / maintenance / surplus around TDEE", () => {
    expect(deriveMacroMode(1800, 2200)).toBe("loss");
    expect(deriveMacroMode(2200, 2200)).toBe("maintain");
    expect(deriveMacroMode(2600, 2200)).toBe("gain");
  });
});

describe("macroTargets (ranges)", () => {
  it("returns undefined for non-positive or non-finite inputs", () => {
    expect(macroTargets({ calorieTarget: 0, trendWeightKg: 80, activityPal: 1.55, mode: "maintain" })).toBeUndefined();
    expect(macroTargets({ calorieTarget: 2000, trendWeightKg: 0, activityPal: 1.55, mode: "maintain" })).toBeUndefined();
    expect(macroTargets({ calorieTarget: NaN, trendWeightKg: 80, activityPal: 1.55, mode: "loss" })).toBeUndefined();
  });

  it("returns low<=high bands for every macro", () => {
    const r = macroTargets({ calorieTarget: 2400, trendWeightKg: 80, activityPal: 1.55, mode: "maintain" })!;
    for (const m of [r.protein, r.fat, r.carbs]) {
      expect(m.lowG).toBeLessThanOrEqual(m.highG);
      expect(m.lowG).toBeGreaterThanOrEqual(0);
    }
  });

  it("scales the protein band with activity level", () => {
    const sedentary = macroTargets({ calorieTarget: 2200, trendWeightKg: 80, activityPal: 1.2, mode: "maintain" })!;
    const active = macroTargets({ calorieTarget: 2200, trendWeightKg: 80, activityPal: 1.9, mode: "maintain" })!;
    expect(sedentary.proteinPerKg.high).toBeLessThan(active.proteinPerKg.high);
    // Sedentary tops out modestly (1.6 g/kg -> 128 g for 80 kg), not maximal.
    expect(sedentary.protein.highG).toBe(128);
  });

  it("nudges protein up in a deficit to preserve lean mass", () => {
    const maintain = macroTargets({ calorieTarget: 2000, trendWeightKg: 80, activityPal: 1.55, mode: "maintain" })!;
    const loss = macroTargets({ calorieTarget: 2000, trendWeightKg: 80, activityPal: 1.55, mode: "loss" })!;
    expect(loss.proteinPerKg.low).toBeGreaterThan(maintain.proteinPerKg.low);
  });

  it("keeps a fat floor of ~0.5 g/kg on low-calorie targets", () => {
    const r = macroTargets({ calorieTarget: 1200, trendWeightKg: 90, activityPal: 1.55, mode: "loss" })!;
    expect(r.fat.lowG).toBeGreaterThanOrEqual(Math.round(0.5 * 90));
    expect(r.carbs.lowG).toBeGreaterThanOrEqual(0);
  });
});
