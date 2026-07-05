import { describe, it, expect } from "vitest";
import {
  bmi,
  idealWeightKg,
  permittedWeeklyChangeKg,
  suggestTargetDateWeeks,
  suggestTargetDate,
  isLossDisallowed,
  healthyWeightRangeKg,
  MIN_GOAL_WEEKS,
  MAX_GOAL_WEEKS,
} from "./guardrails.js";

describe("healthyWeightRangeKg", () => {
  it("derives the WHO healthy BMI band (18.5–24.9) for a height", () => {
    const r = healthyWeightRangeKg(180);
    // 1.8 m: 18.5*3.24=59.94 -> 60.0 ; 24.9*3.24=80.68 -> 80.5
    expect(r.lowKg).toBe(60);
    expect(r.highKg).toBe(80.5);
    expect(r.lowKg).toBeLessThan(r.highKg);
    // Midpoint is rounded to 0.5 kg, so allow a half-kg of slack.
    expect(Math.abs(r.midpointKg - (r.lowKg + r.highKg) / 2)).toBeLessThanOrEqual(0.5);
  });
});

describe("bmi", () => {
  it("computes BMI from kg and cm", () => {
    expect(bmi(80, 180)).toBeCloseTo(24.69, 2);
  });
});

describe("idealWeightKg", () => {
  it("uses BMI 21.7 and rounds to 0.5 kg", () => {
    // female 1.70m: 21.7*2.89 = 62.71 -> 62.5
    expect(idealWeightKg(170, "female")).toBe(62.5);
  });
  it("applies +5% for males", () => {
    // male 1.80m: 21.7*3.24 = 70.31 *1.05 = 73.82 -> 74.0
    expect(idealWeightKg(180, "male")).toBe(74);
  });
});

describe("permittedWeeklyChangeKg (BMI tiers, Req 10.2)", () => {
  it("underweight: no loss, gain only", () => {
    const r = permittedWeeklyChangeKg(45, 175); // BMI ~14.7
    expect(r.loss).toBe(0);
    expect(r.gain).toBeGreaterThan(0);
  });
  it("normal BMI: 0.25 kg/week loss", () => {
    expect(permittedWeeklyChangeKg(68, 175).loss).toBe(0.25); // BMI ~22.2
  });
  it("overweight: 0.35 kg/week loss", () => {
    expect(permittedWeeklyChangeKg(85, 175).loss).toBe(0.35); // BMI ~27.8
  });
  it("obese: 0.5 kg/week loss, no gain", () => {
    const r = permittedWeeklyChangeKg(105, 175); // BMI ~34.3
    expect(r.loss).toBe(0.5);
    expect(r.gain).toBe(0);
  });
  it("extremely obese: 1.0 kg/week loss", () => {
    expect(permittedWeeklyChangeKg(130, 175).loss).toBe(1.0); // BMI ~42.4
  });
});

describe("suggestTargetDateWeeks (Req 10.3)", () => {
  it("divides change by rate and clamps to [2,52]", () => {
    // normal BMI, lose 5 kg at 0.25/wk = 20 weeks (within range)
    expect(suggestTargetDateWeeks(68, 63, 175)).toBeCloseTo(20, 6);
  });
  it("clamps a tiny change up to the 2-week minimum", () => {
    expect(suggestTargetDateWeeks(68, 67.9, 175)).toBe(MIN_GOAL_WEEKS);
  });
  it("clamps a huge change down to the 52-week maximum", () => {
    expect(suggestTargetDateWeeks(120, 70, 175)).toBe(MAX_GOAL_WEEKS);
  });
});

describe("suggestTargetDate", () => {
  it("adds rounded weeks to today", () => {
    // 20 weeks * 7 = 140 days after 2026-01-01
    expect(suggestTargetDate(68, 63, 175, "2026-01-01")).toBe("2026-05-21");
  });
});

describe("isLossDisallowed (Req 10.4)", () => {
  it("is true when underweight", () => {
    expect(isLossDisallowed(45, 175)).toBe(true);
  });
  it("is false at normal weight", () => {
    expect(isLossDisallowed(68, 175)).toBe(false);
  });
});
