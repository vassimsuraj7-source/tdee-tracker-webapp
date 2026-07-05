import {
  computeWindowTdees,
  computeTrendWeight,
  estimatedTdee,
  calorieTarget,
  ACTIVITY_PAL,
  type TdeeSource,
  type CalorieTargetResult,
  type WindowTdeeSeries,
} from "@tdee/engine";
import type { SupabaseClient } from "./db.js";
import {
  loadWeights,
  loadCalories,
  loadProfile,
  loadWeightMainGoal,
  upsertTdeeRecords,
  saveCurrentTarget,
} from "./repository.js";
import { deriveAge } from "./profile.js";

export interface RecomputeResult {
  series: WindowTdeeSeries;
  currentTdee: number | undefined;
  tdeeSource: TdeeSource;
  target: CalorieTargetResult;
}

/**
 * The Daily Recompute (Task 6, Req 5.4, 14, 15, 16). Loads history, computes the
 * data-driven TDEE series, chooses the current TDEE (data-driven preferred, else the
 * BMR estimate), derives the guardrail-constrained calorie target, and persists both
 * the TDEE history and the current-target snapshot. Pure inputs: `today` is supplied.
 *
 * Idempotent (Req 5.5): all writes are upserts / singleton updates, so re-running for
 * the same underlying data yields identical stored state.
 */
export async function runRecompute(client: SupabaseClient, today: string): Promise<RecomputeResult> {
  const [weights, calories, profile, goal] = await Promise.all([
    loadWeights(client),
    loadCalories(client),
    loadProfile(client),
    loadWeightMainGoal(client),
  ]);

  // 1) Data-driven TDEE across all valid windows.
  const series = computeWindowTdees(weights, calories, today);

  // 2) Persist the TDEE history (upsert by window_end).
  await upsertTdeeRecords(
    client,
    series.history.map((h) => ({
      window_start: h.window.start,
      window_end: h.window.end,
      value: h.tdee,
      valid_days: h.validDays,
    })),
  );

  // 3) Choose current TDEE: data-driven preferred, else estimated, else undetermined.
  let currentTdee: number | undefined;
  let tdeeSource: TdeeSource;
  const latestWeight = weights.at(-1)?.value;

  if (series.current) {
    currentTdee = series.current.tdee;
    tdeeSource = "data-driven";
  } else if (
    profile?.height_cm &&
    profile.date_of_birth &&
    profile.gender &&
    latestWeight !== undefined
  ) {
    const pal = profile.activity_pal ?? ACTIVITY_PAL.moderate;
    currentTdee = estimatedTdee(
      {
        weightKg: latestWeight,
        heightCm: profile.height_cm,
        ageYears: deriveAge(profile.date_of_birth, today),
        gender: profile.gender,
      },
      pal,
    );
    tdeeSource = "estimated";
  } else {
    currentTdee = undefined;
    tdeeSource = "undetermined";
  }

  // 4) Calorie target with BMI guardrails. Goal is only applied when we have a height
  //    to anchor BMI; otherwise fall back to maintenance.
  const trendWeightKg = computeTrendWeight(weights, today);
  const canUseGoal = goal !== null && goal.targetDate !== null && !!profile?.height_cm;

  const target = calorieTarget({
    currentTdee,
    tdeeSource,
    currentTrendWeightKg: trendWeightKg,
    heightCm: profile?.height_cm ?? 0,
    ...(canUseGoal
      ? { goal: { targetWeightKg: goal!.targetWeightKg, targetDate: goal!.targetDate! } }
      : {}),
    today,
  });

  // 5) Persist the current-target snapshot the dashboard reads.
  await saveCurrentTarget(client, {
    calorie_target: target.calorieTarget ?? null,
    tdee_used: target.tdeeUsed ?? null,
    tdee_source: target.tdeeSource,
    rate_capped: target.rateCapped,
    date_unachievable: target.dateUnachievable,
    warning: target.warning ?? null,
  });

  return { series, currentTdee, tdeeSource, target };
}
