/**
 * Goal projection: extrapolate the current weight trend to estimate when the user
 * will reach their goal weight, and compare that to their target date.
 *
 * Pure: takes the current trend weight and an observed weekly rate of change, and
 * projects a date. It does not decide *how* the rate was measured (the caller picks
 * a stable baseline window).
 */
import type { IsoDate } from "./types.js";
import { addDays, diffDays } from "./date.js";

export type GoalProjectionStatus =
  | "reached" // already at (or past) goal
  | "stalled" // trend essentially flat — no ETA
  | "wrong_direction" // moving away from the goal
  | "projecting" // progressing, no target date to compare against
  | "ahead" // will reach the goal comfortably before the target date
  | "on_track" // will reach it around the target date (± a week)
  | "behind"; // will reach it after the target date

export interface GoalProjectionInput {
  readonly currentTrendKg: number;
  /** Observed signed weekly rate of weight change (kg/week). */
  readonly weeklyRateKg: number;
  readonly goalWeightKg: number;
  readonly goalDate?: IsoDate;
  readonly today: IsoDate;
}

export interface GoalProjection {
  readonly status: GoalProjectionStatus;
  /** Signed kg still to change (goal − current). */
  readonly remainingKg: number;
  readonly weeklyRateKg: number;
  readonly weeksToGoal: number | null;
  readonly projectedDate: IsoDate | null;
  /** Days earlier(+)/later(−) than the target date, when both are known. */
  readonly daysVsGoalDate: number | null;
}

export function projectGoal(input: GoalProjectionInput): GoalProjection {
  const { currentTrendKg, weeklyRateKg, goalWeightKg, goalDate, today } = input;
  const remaining = goalWeightKg - currentTrendKg;
  const base = {
    remainingKg: remaining,
    weeklyRateKg,
    weeksToGoal: null,
    projectedDate: null,
    daysVsGoalDate: null,
  } as const;

  if (Math.abs(remaining) < 0.2) {
    return { ...base, status: "reached", weeksToGoal: 0, projectedDate: today };
  }
  const needDirection = Math.sign(remaining);
  if (Math.abs(weeklyRateKg) < 0.05) return { ...base, status: "stalled" };
  if (Math.sign(weeklyRateKg) !== needDirection) return { ...base, status: "wrong_direction" };

  const weeks = remaining / weeklyRateKg; // both share sign -> positive
  const projectedDate = addDays(today, Math.round(weeks * 7));

  if (!goalDate) {
    return { ...base, status: "projecting", weeksToGoal: weeks, projectedDate };
  }

  const daysVs = diffDays(projectedDate, goalDate); // >0 => goal date later => we're ahead
  let status: GoalProjectionStatus;
  if (Math.abs(daysVs) <= 7) status = "on_track";
  else if (daysVs > 0) status = "ahead";
  else status = "behind";

  return { ...base, status, weeksToGoal: weeks, projectedDate, daysVsGoalDate: daysVs };
}
