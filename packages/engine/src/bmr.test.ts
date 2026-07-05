import { describe, it, expect } from "vitest";
import { bmr, estimatedTdee, DEFAULT_BMR } from "./bmr.js";
import { ACTIVITY_PAL } from "./types.js";

describe("bmr (Mifflin-St Jeor)", () => {
  it("computes the male equation", () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5 = 1780
    expect(bmr({ weightKg: 80, heightCm: 180, ageYears: 30, gender: "male" })).toBeCloseTo(1780, 6);
  });

  it("computes the female equation", () => {
    // 10*65 + 6.25*165 - 5*30 - 161 = 650 + 1031.25 - 150 - 161 = 1370.25
    expect(bmr({ weightKg: 65, heightCm: 165, ageYears: 30, gender: "female" })).toBeCloseTo(
      1370.25,
      6,
    );
  });

  it("treats 'other' as the female equation", () => {
    const female = bmr({ weightKg: 65, heightCm: 165, ageYears: 30, gender: "female" });
    const other = bmr({ weightKg: 65, heightCm: 165, ageYears: 30, gender: "other" });
    expect(other).toBeCloseTo(female, 6);
  });

  it("returns the safe default on invalid input", () => {
    expect(bmr({ weightKg: 0, heightCm: 180, ageYears: 30, gender: "male" })).toBe(DEFAULT_BMR);
    expect(bmr({ weightKg: 80, heightCm: -1, ageYears: 30, gender: "male" })).toBe(DEFAULT_BMR);
    expect(bmr({ weightKg: 80, heightCm: 180, ageYears: 0, gender: "male" })).toBe(DEFAULT_BMR);
  });
});

describe("estimatedTdee", () => {
  it("multiplies BMR by the activity PAL", () => {
    const input = { weightKg: 80, heightCm: 180, ageYears: 30, gender: "male" as const };
    expect(estimatedTdee(input, ACTIVITY_PAL.moderate)).toBeCloseTo(1780 * 1.55, 6);
  });
});
