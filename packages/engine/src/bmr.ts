import type { Gender } from "./types.js";

/** Safe fallback BMR (kcal/day) used when inputs are invalid, matching the native app. */
export const DEFAULT_BMR = 1500;

export interface BmrInput {
  readonly weightKg: number;
  readonly heightCm: number;
  readonly ageYears: number;
  readonly gender: Gender;
}

/**
 * Basal Metabolic Rate via the Mifflin-St Jeor equation (Req 14.1):
 *   male:   10*kg + 6.25*cm - 5*age + 5
 *   female: 10*kg + 6.25*cm - 5*age - 161
 * "other" uses the female constant, matching the native isMale=false path.
 * Returns DEFAULT_BMR on invalid input rather than NaN, as the native code did.
 */
export function bmr(input: BmrInput): number {
  const { weightKg, heightCm, ageYears, gender } = input;
  if (!(weightKg > 0) || !(heightCm > 0) || !(ageYears > 0)) return DEFAULT_BMR;

  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  const value = gender === "male" ? base + 5 : base - 161;
  return Number.isFinite(value) ? value : DEFAULT_BMR;
}

/**
 * Estimated TDEE = BMR × activity PAL (Req 14.1). Used as a bootstrap/fallback when
 * no data-driven window is available.
 */
export function estimatedTdee(input: BmrInput, activityPal: number): number {
  return bmr(input) * activityPal;
}
