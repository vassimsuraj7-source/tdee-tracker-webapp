import { addDays, fillMissingWeightData, trendWeight, projectGoal, type GoalProjection } from "@tdee/engine";
import type { SupabaseClient } from "./db.js";
import { loadWeights, loadWeightMainGoal } from "./repository.js";

export interface GoalProjectionResult {
  hasGoal: boolean;
  goalWeightKg: number | null;
  goalDate: string | null;
  currentTrendKg: number | null;
  /** Weight recorded when the goal was set — the progress-bar starting point. */
  startWeightKg: number | null;
  /** Baseline window (days) used to measure the rate, for transparency. */
  rateWindowDays: number | null;
  projection: GoalProjection | null;
}

const EMPTY = (goal?: { targetWeightKg: number; targetDate: string | null; startWeightKg: number | null }): GoalProjectionResult => ({
  hasGoal: !!goal,
  goalWeightKg: goal?.targetWeightKg ?? null,
  goalDate: goal?.targetDate ?? null,
  currentTrendKg: null,
  startWeightKg: goal?.startWeightKg ?? null,
  rateWindowDays: null,
  projection: null,
});

/**
 * Project when the weight goal will be reached from the current trend. The rate is
 * measured over the longest available baseline (28 → 21 → 14 → 7 days) so a single
 * noisy week doesn't dominate the estimate.
 */
export async function getGoalProjection(client: SupabaseClient, today: string): Promise<GoalProjectionResult> {
  const goal = await loadWeightMainGoal(client);
  if (!goal) return EMPTY();

  const weights = await loadWeights(client);
  if (weights.length === 0) return EMPTY(goal);

  const filled = fillMissingWeightData(weights, weights[0]!.date, today);
  const trendNow = trendWeight(filled, today, 7);
  if (trendNow === undefined) return EMPTY(goal);

  let rate: number | null = null;
  let rateWindowDays: number | null = null;
  for (const daysBack of [28, 21, 14, 7]) {
    const past = trendWeight(filled, addDays(today, -daysBack), 7);
    if (past !== undefined) {
      rate = (trendNow - past) / (daysBack / 7);
      rateWindowDays = daysBack;
      break;
    }
  }

  const projection =
    rate != null
      ? projectGoal({
          currentTrendKg: trendNow,
          weeklyRateKg: rate,
          goalWeightKg: goal.targetWeightKg,
          ...(goal.targetDate ? { goalDate: goal.targetDate } : {}),
          today,
        })
      : null;

  return {
    hasGoal: true,
    goalWeightKg: goal.targetWeightKg,
    goalDate: goal.targetDate,
    currentTrendKg: trendNow,
    startWeightKg: goal.startWeightKg,
    rateWindowDays,
    projection,
  };
}
