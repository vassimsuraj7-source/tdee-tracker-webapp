import type { Gender, IsoDate } from "./types.js";
import { addDays } from "./date.js";
import { clamp } from "./util.js";

export const MIN_GOAL_WEEKS = 2;
export const MAX_GOAL_WEEKS = 52;

/** Body Mass Index from weight (kg) and height (cm). */
export function bmi(weightKg: number, heightCm: number): number {
  const h = heightCm / 100;
  return weightKg / (h * h);
}

/**
 * Suggested healthy target weight (Req 10.1): BMI 21.7 midpoint, +5% for males,
 * rounded to the nearest 0.5 kg.
 */
export function idealWeightKg(heightCm: number, gender: Gender): number {
  const h = heightCm / 100;
  let w = 21.7 * h * h;
  if (gender === "male") w *= 1.05;
  return Math.round(w * 2) / 2;
}

/** Permitted weekly weight-change magnitudes (kg/week) for the user's BMI tier. */
export interface PermittedWeeklyChange {
  /** Max healthy weekly loss; 0 means loss is disallowed (underweight). */
  readonly loss: number;
  /** Max healthy weekly gain; 0 means gain is not advised at this BMI. */
  readonly gain: number;
}

/**
 * BMI-tiered healthy weekly change rates (Req 10.2), ported from the native
 * `getWeightChangeRate`. Loss tiers: none (<18.5), 0.25 (18.5-25), 0.35 (25-30),
 * 0.5 (30-40), 1.0 (>=40). Gain rates scale with current body weight.
 */
export function permittedWeeklyChangeKg(
  currentWeightKg: number,
  heightCm: number,
): PermittedWeeklyChange {
  const b = bmi(currentWeightKg, heightCm);
  if (b < 18.5) return { loss: 0, gain: currentWeightKg * 0.005 };
  if (b < 25) return { loss: 0.25, gain: currentWeightKg * 0.0025 };
  if (b < 30) return { loss: 0.35, gain: currentWeightKg * 0.0025 };
  if (b < 40) return { loss: 0.5, gain: 0 };
  return { loss: 1.0, gain: 0 };
}

/**
 * Suggested number of weeks to reach a target weight at the permitted rate
 * (Req 10.3), clamped to [2, 52]. Falls back to 26 weeks when the required
 * direction has no permitted rate, matching the native default.
 */
export function suggestTargetDateWeeks(
  currentWeightKg: number,
  targetWeightKg: number,
  heightCm: number,
): number {
  const diff = targetWeightKg - currentWeightKg;
  const { loss, gain } = permittedWeeklyChangeKg(currentWeightKg, heightCm);

  let weeks: number;
  if (diff > 0) {
    weeks = gain > 0 ? diff / gain : 26;
  } else if (diff < 0) {
    weeks = loss > 0 ? Math.abs(diff) / loss : 26;
  } else {
    weeks = 0;
  }
  return clamp(weeks, MIN_GOAL_WEEKS, MAX_GOAL_WEEKS);
}

/** Suggested target date = today + suggested weeks (rounded to whole days). */
export function suggestTargetDate(
  currentWeightKg: number,
  targetWeightKg: number,
  heightCm: number,
  today: IsoDate,
): IsoDate {
  const weeks = suggestTargetDateWeeks(currentWeightKg, targetWeightKg, heightCm);
  return addDays(today, Math.round(weeks * 7));
}

/** True when a weight-loss goal is unsafe because the user is underweight (Req 10.4). */
export function isLossDisallowed(currentWeightKg: number, heightCm: number): boolean {
  return bmi(currentWeightKg, heightCm) < 18.5;
}
