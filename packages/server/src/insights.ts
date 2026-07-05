import { addDays, fillMissingWeightData, trendWeight, macroTargets, deriveMacroMode, fiberTargetG, KCAL_PER_KG } from "@tdee/engine";
import type { SupabaseClient } from "./db.js";
import { loadWeights, loadCalories } from "./repository.js";

/**
 * A read-only weekly recap (MacroFactor-style "here's your week"). Everything is
 * derived on read from stored entries + the current target snapshot; no schema or
 * write is involved.
 */
export interface WeeklyInsights {
  /** Average of logged (value > 0) calorie days in the last 7 days. */
  avgIntake7d: number | null;
  /** Same for the preceding 7 days (days -13..-7), for a week-over-week delta. */
  avgIntakePrev7d: number | null;
  /** How many of the last 7 days had a logged calorie entry. */
  loggedDays7d: number;
  /** Current calorie target and TDEE (from the recompute snapshot). */
  calorieTarget: number | null;
  tdee: number | null;
  /** Average intake as a % of the calorie target (100 = on plan). */
  adherencePct: number | null;
  /** Actual trend-weight change over the last week (kg): trend now − trend 7d ago. */
  actualWeeklyRateKg: number | null;
  /** Weekly change implied by energy balance: (avgIntake − TDEE) × 7 / 7700. */
  impliedWeeklyRateKg: number | null;
  /** Current trend weight (kg), for reference. */
  trendWeightKg: number | null;
  /** 7-day average logged protein (g), and the recommended range for context. */
  avgProtein7d: number | null;
  proteinTargetLowG: number | null;
  proteinTargetHighG: number | null;
  /** 7-day average logged fiber (g), and the daily target (14 g/1000 kcal). */
  avgFiber7d: number | null;
  fiberTarget: number | null;
}

function mean(rows: { value: number }[]): number | null {
  if (rows.length === 0) return null;
  return rows.reduce((s, r) => s + r.value, 0) / rows.length;
}

/** Compute the weekly insights recap for the dashboard. */
export async function getWeeklyInsights(client: SupabaseClient, today: string): Promise<WeeklyInsights> {
  const [weights, calories] = await Promise.all([loadWeights(client), loadCalories(client)]);

  const start7 = addDays(today, -6);
  const startPrev = addDays(today, -13);
  const endPrev = addDays(today, -7);
  const inRange = (d: string, a: string, b: string): boolean => d >= a && d <= b;

  const valid7 = calories.filter((c) => c.value > 0 && inRange(c.date, start7, today));
  const validPrev = calories.filter((c) => c.value > 0 && inRange(c.date, startPrev, endPrev));
  const avgIntake7d = mean(valid7);
  const avgIntakePrev7d = mean(validPrev);

  // Trend weight now vs. one week ago (uses the engine's imputation + 7-day SMA).
  let trendNow: number | null = null;
  let trendPrev: number | null = null;
  if (weights.length > 0) {
    const filled = fillMissingWeightData(weights, weights[0]!.date, today);
    const tn = trendWeight(filled, today, 7);
    const tp = trendWeight(filled, addDays(today, -7), 7);
    trendNow = tn === undefined ? null : tn;
    trendPrev = tp === undefined ? null : tp;
  }
  const actualWeeklyRateKg = trendNow != null && trendPrev != null ? trendNow - trendPrev : null;

  // Current target snapshot.
  const { data, error } = await client
    .from("current_target")
    .select("calorie_target, tdee_used")
    .eq("id", 1)
    .limit(1);
  if (error) throw new Error(error.message);
  const ct = data?.[0] as { calorie_target: number | null; tdee_used: number | null } | undefined;
  const calorieTarget = ct?.calorie_target ?? null;
  const tdee = ct?.tdee_used ?? null;

  const adherencePct =
    avgIntake7d != null && calorieTarget != null && calorieTarget > 0
      ? Math.round((avgIntake7d / calorieTarget) * 100)
      : null;
  const impliedWeeklyRateKg =
    avgIntake7d != null && tdee != null ? ((avgIntake7d - tdee) * 7) / KCAL_PER_KG : null;

  // Protein & fiber adherence over the last 7 days.
  const { data: macroData, error: macroErr } = await client
    .from("calorie_entries")
    .select("protein_g, fiber_g")
    .gte("entry_date", start7)
    .lte("entry_date", today);
  if (macroErr) throw new Error(macroErr.message);
  const macroRows = (macroData ?? []) as { protein_g: number | null; fiber_g: number | null }[];
  const avgCol = (vals: (number | null)[]): number | null => {
    const nums = vals.filter((v): v is number => v != null && v > 0);
    return nums.length ? Math.round(nums.reduce((s, v) => s + v, 0) / nums.length) : null;
  };
  const avgProtein7d = avgCol(macroRows.map((r) => r.protein_g));
  const avgFiber7d = avgCol(macroRows.map((r) => r.fiber_g));

  const { data: pData, error: pErr } = await client
    .from("user_profile")
    .select("activity_pal")
    .eq("id", 1)
    .limit(1);
  if (pErr) throw new Error(pErr.message);
  const activityPal = (pData?.[0]?.activity_pal as number | null) ?? 1.55;

  let proteinTargetLowG: number | null = null;
  let proteinTargetHighG: number | null = null;
  if (calorieTarget != null && tdee != null && trendNow != null) {
    const mt = macroTargets({
      calorieTarget,
      trendWeightKg: trendNow,
      activityPal,
      mode: deriveMacroMode(calorieTarget, tdee),
    });
    if (mt) {
      proteinTargetLowG = mt.protein.lowG;
      proteinTargetHighG = mt.protein.highG;
    }
  }
  const fiberTarget = calorieTarget != null ? fiberTargetG(calorieTarget) : null;

  return {
    avgIntake7d,
    avgIntakePrev7d,
    loggedDays7d: valid7.length,
    calorieTarget,
    tdee,
    adherencePct,
    actualWeeklyRateKg,
    impliedWeeklyRateKg,
    trendWeightKg: trendNow,
    avgProtein7d,
    proteinTargetLowG,
    proteinTargetHighG,
    avgFiber7d,
    fiberTarget,
  };
}
