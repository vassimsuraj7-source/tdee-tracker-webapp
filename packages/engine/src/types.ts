/**
 * Core domain types for the TDEE engine.
 *
 * The engine is pure: it operates only on these plain data structures and never
 * touches the database, network, or clock (dates are passed in explicitly). This
 * keeps every calculation deterministic and unit-testable, and lets the same code
 * run in a Supabase Edge Function and in tests unchanged.
 *
 * Dates are represented as ISO calendar-day strings ("YYYY-MM-DD"), normalized to
 * the user's local day, matching the Entry_Date concept in the design.
 */

/** An ISO calendar-day string, e.g. "2026-07-04". */
export type IsoDate = string;

/** A single dated numeric value (weight in kg, calories, steps, etc.). */
export interface DatedValue {
  readonly date: IsoDate;
  readonly value: number;
}

/** Gender as stored in the user profile; drives the BMR equation variant. */
export type Gender = "male" | "female" | "other";

/**
 * Physical Activity Level multipliers (Mifflin-St Jeor × PAL), matching the
 * native app's ActivityLevel enum raw values.
 */
export const ACTIVITY_PAL = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  veryActive: 1.9,
} as const;

export type ActivityLevelKey = keyof typeof ACTIVITY_PAL;

/** Energy density of body-weight change used throughout: 7700 kcal per kg. */
export const KCAL_PER_KG = 7700;

/** Absolute lower bound enforced on any recommended calorie target (Req 16.3). */
export const CALORIE_TARGET_FLOOR = 1200;

/** Whether a produced TDEE value came from logged data or the BMR estimate. */
export type TdeeSource = "data-driven" | "estimated" | "undetermined";
