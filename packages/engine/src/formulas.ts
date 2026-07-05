/**
 * Literature BMR/TDEE formulas, for comparing the app's data-driven TDEE against
 * the classic textbook estimates. All are pure functions.
 *
 * The data-driven method (rolling window over real intake + weight trend) is the
 * ground truth for a given person; these formulas are population regressions and
 * are provided for context/curiosity, not to override the measured value.
 *
 *   Mifflin-St Jeor (1990)     — weight, height, age, sex. Modern default.
 *   Harris-Benedict (rev.1984) — weight, height, age, sex. The classic equation.
 *   Katch-McArdle              — lean body mass only (needs body-fat %).
 *   Cunningham (1980)          — lean body mass only (needs body-fat %).
 *
 * Estimated TDEE = BMR × the activity PAL multiplier.
 */
import type { Gender } from "./types.js";
import { bmr as mifflinBmr, DEFAULT_BMR } from "./bmr.js";

export interface FormulaInput {
  readonly weightKg: number;
  readonly heightCm: number;
  readonly ageYears: number;
  readonly gender: Gender;
  readonly activityPal: number;
  /** Body-fat as a fraction (0..1); enables the lean-mass-based formulas. */
  readonly bodyFatFraction?: number;
}

export interface FormulaEstimate {
  readonly key: string;
  readonly name: string;
  /** Short description of what the formula is based on. */
  readonly basis: string;
  readonly bmr: number | null;
  readonly tdee: number | null;
  /** True if the formula needs body-fat % and it was unavailable. */
  readonly requiresBodyFat: boolean;
}

/** Revised Harris-Benedict (Roza & Shizgal, 1984). "other" uses the female constants. */
export function harrisBenedictBmr(weightKg: number, heightCm: number, ageYears: number, gender: Gender): number {
  if (!(weightKg > 0) || !(heightCm > 0) || !(ageYears > 0)) return DEFAULT_BMR;
  const v =
    gender === "male"
      ? 88.362 + 13.397 * weightKg + 4.799 * heightCm - 5.677 * ageYears
      : 447.593 + 9.247 * weightKg + 3.098 * heightCm - 4.33 * ageYears;
  return Number.isFinite(v) ? v : DEFAULT_BMR;
}

/** Lean body mass (kg) from weight and body-fat fraction. */
export function leanBodyMassKg(weightKg: number, bodyFatFraction: number): number {
  return weightKg * (1 - bodyFatFraction);
}

/** Katch-McArdle: 370 + 21.6 × LBM(kg). */
export function katchMcArdleBmr(leanMassKg: number): number {
  return 370 + 21.6 * leanMassKg;
}

/** Cunningham (1980): 500 + 22 × LBM(kg). */
export function cunninghamBmr(leanMassKg: number): number {
  return 500 + 22 * leanMassKg;
}

/**
 * Compute BMR + estimated TDEE for each literature formula. Lean-mass formulas
 * return null values (with requiresBodyFat = true) when no body-fat % is available.
 */
export function compareTdeeFormulas(input: FormulaInput): FormulaEstimate[] {
  const { weightKg, heightCm, ageYears, gender, bodyFatFraction } = input;
  const pal = input.activityPal > 0 ? input.activityPal : 1.55;

  const estimates: FormulaEstimate[] = [];

  const mif = mifflinBmr({ weightKg, heightCm, ageYears, gender });
  estimates.push({ key: "mifflin", name: "Mifflin-St Jeor", basis: "weight, height, age, sex", bmr: mif, tdee: mif * pal, requiresBodyFat: false });

  const hb = harrisBenedictBmr(weightKg, heightCm, ageYears, gender);
  estimates.push({ key: "harris", name: "Harris-Benedict", basis: "weight, height, age, sex", bmr: hb, tdee: hb * pal, requiresBodyFat: false });

  const hasBf = bodyFatFraction != null && bodyFatFraction > 0 && bodyFatFraction < 1 && weightKg > 0;
  const lbm = hasBf ? leanBodyMassKg(weightKg, bodyFatFraction as number) : null;

  const km = lbm != null ? katchMcArdleBmr(lbm) : null;
  estimates.push({ key: "katch", name: "Katch-McArdle", basis: "lean body mass (needs body-fat %)", bmr: km, tdee: km != null ? km * pal : null, requiresBodyFat: true });

  const cun = lbm != null ? cunninghamBmr(lbm) : null;
  estimates.push({ key: "cunningham", name: "Cunningham", basis: "lean body mass (needs body-fat %)", bmr: cun, tdee: cun != null ? cun * pal : null, requiresBodyFat: true });

  return estimates;
}
