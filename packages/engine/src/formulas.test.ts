import { describe, it, expect } from "vitest";
import {
  harrisBenedictBmr,
  leanBodyMassKg,
  katchMcArdleBmr,
  cunninghamBmr,
  compareTdeeFormulas,
} from "./formulas.js";

describe("literature formulas", () => {
  it("Harris-Benedict matches the published equation for a known male case", () => {
    // 80 kg, 180 cm, 30 y, male: 88.362 + 13.397*80 + 4.799*180 - 5.677*30 = 1853.63
    expect(harrisBenedictBmr(80, 180, 30, "male")).toBeCloseTo(1853.63, 1);
  });

  it("lean-mass formulas use body fat", () => {
    const lbm = leanBodyMassKg(80, 0.2); // 64 kg
    expect(lbm).toBe(64);
    expect(katchMcArdleBmr(64)).toBeCloseTo(370 + 21.6 * 64, 5);
    expect(cunninghamBmr(64)).toBeCloseTo(500 + 22 * 64, 5);
  });

  it("compareTdeeFormulas returns Mifflin + Harris with TDEE = BMR × PAL", () => {
    const out = compareTdeeFormulas({ weightKg: 80, heightCm: 180, ageYears: 30, gender: "male", activityPal: 1.55 });
    const mif = out.find((e) => e.key === "mifflin")!;
    expect(mif.tdee).toBeCloseTo(mif.bmr! * 1.55, 5);
    // Without body fat, lean-mass formulas are unavailable.
    expect(out.find((e) => e.key === "katch")!.tdee).toBeNull();
  });

  it("lean-mass formulas populate when body fat is provided", () => {
    const out = compareTdeeFormulas({ weightKg: 80, heightCm: 180, ageYears: 30, gender: "male", activityPal: 1.55, bodyFatFraction: 0.2 });
    const katch = out.find((e) => e.key === "katch")!;
    expect(katch.tdee).not.toBeNull();
    expect(katch.bmr).toBeCloseTo(370 + 21.6 * 64, 5);
  });
});
