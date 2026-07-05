import { addDays, fillMissingWeightData, trendWeight, assessPlateau, type PlateauAssessment } from "@tdee/engine";
import type { SupabaseClient } from "./db.js";
import { loadWeights, loadCalories, loadWeightMainGoal } from "./repository.js";

export interface PlateauResult {
  assessment: PlateauAssessment;
}

/**
 * Assess whether the user is in a plateau. Weekly rate is measured over the longest
 * available baseline of at least 14 days (28 → 21 → 14) so short-term noise doesn't
 * masquerade as a stall; average intake is taken over the last 14 days.
 */
export async function getPlateauAssessment(client: SupabaseClient, today: string): Promise<PlateauResult> {
  const [weights, calories, goal, phaseRes] = await Promise.all([
    loadWeights(client),
    loadCalories(client),
    loadWeightMainGoal(client),
    client.from("diet_phases").select("phase_type").is("end_date", null).limit(1),
  ]);
  const currentPhase = (phaseRes.data?.[0]?.phase_type as string | undefined) ?? undefined;

  let weeklyRateKg: number | null = null;
  let windowDays: number | null = null;
  let trendNow: number | undefined;
  if (weights.length > 0) {
    const filled = fillMissingWeightData(weights, weights[0]!.date, today);
    trendNow = trendWeight(filled, today, 7);
    if (trendNow !== undefined) {
      for (const db of [28, 21, 14]) {
        const past = trendWeight(filled, addDays(today, -db), 7);
        if (past !== undefined) {
          weeklyRateKg = (trendNow - past) / (db / 7);
          windowDays = db;
          break;
        }
      }
    }
  }

  const start14 = addDays(today, -13);
  const intake = calories.filter((c) => c.value > 0 && c.date >= start14 && c.date <= today).map((c) => c.value);
  const avgIntakeKcal = intake.length ? intake.reduce((s, v) => s + v, 0) / intake.length : null;

  const { data, error } = await client
    .from("current_target")
    .select("tdee_used, tdee_source")
    .eq("id", 1)
    .limit(1);
  if (error) throw new Error(error.message);
  const ct = data?.[0] as { tdee_used: number | null; tdee_source: string | null } | undefined;

  const goalReached = !!(goal && trendNow !== undefined && Math.abs(goal.targetWeightKg - trendNow) < 0.2);

  const assessment = assessPlateau({
    hasWeightGoal: !!goal,
    goalReached,
    weeklyRateKg,
    windowDays,
    avgIntakeKcal,
    measuredTdee: ct?.tdee_used ?? null,
    tdeeSource: ct?.tdee_source ?? null,
    ...(currentPhase ? { phase: currentPhase } : {}),
  });

  return { assessment };
}
