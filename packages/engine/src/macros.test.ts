import { describe, it, expect } from "vitest";
import { macroTargets, deriveMacroMode, KCAL_PER_G } from "./macros.js";

describe("deriveMacroMode", () => {
  it("classifies deficit / maintenance / surplus around TDEE", () => {
    expect(deriveMacroMode(1800, 2200)).toBe("loss");
    expect(deriveMacroMode(2200, 2200)).toBe("maintain");
    expect(deriveMacroMode(2600, 2200)).toBe("gain");
  });
});

describe("macroTargets", () => {
  it("returns undefined for non-positive or non-finite inputs", () => {
    expect(macroTargets({ calorieTarget: 0, trendWeightKg: 80, mode: "maintain" })).toBeUndefined();
    expect(macroTargets({ calorieTarget: 2000, trendWeightKg: 0, mode: "maintain" })).toBeUndefined();
    expect(macroTargets({ calorieTarget: NaN, trendWeightKg: 80, mode: "loss" })).toBeUndefined();
  });

  it("macro calories sum to (approximately) the calorie target", () => {
    const r = macroTargets({ calorieTarget: 2400, trendWeightKg: 80, mode: "maintain" })!;
    const sum = r.proteinKcal + r.fatKcal + r.carbsKcal;
    // Carbs absorb the remainder, so the sum matches the target within rounding.
    expect(Math.abs(sum - 2400)).toBeLessThanOrEqual(4);
  });

  it("uses higher protein in a deficit than at maintenance", () => {
    const loss = macroTargets({ calorieTarget: 2000, trendWeightKg: 80, mode: "loss" })!;
    const maintain = macroTargets({ calorieTarget: 2000, trendWeightKg: 80, mode: "maintain" })!;
    expect(loss.proteinG).toBeGreaterThan(maintain.proteinG);
    // 2.0 g/kg for an 80 kg person in a deficit.
    expect(loss.proteinG).toBe(160);
  });

  it("never produces negative carbs and keeps a fat floor on tight targets", () => {
    const r = macroTargets({ calorieTarget: 1200, trendWeightKg: 90, mode: "loss" })!;
    expect(r.carbsG).toBeGreaterThanOrEqual(0);
    expect(r.fatG).toBeGreaterThan(0);
    // Fat should not fall below the ~0.6 g/kg floor (54 g here) unless protein alone
    // already exceeds the target.
    expect(r.fatG).toBeGreaterThanOrEqual(40);
  });

  it("caps protein so it cannot exceed 40% of a small target", () => {
    const r = macroTargets({ calorieTarget: 1200, trendWeightKg: 120, mode: "loss" })!;
    expect(r.proteinKcal).toBeLessThanOrEqual(0.4 * 1200 + KCAL_PER_G.protein);
  });
});
