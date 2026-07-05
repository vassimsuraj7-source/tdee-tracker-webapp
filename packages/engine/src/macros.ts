/**
 * Macro target derivation (MacroFactor-style).
 *
 * Given an already-computed daily Calorie_Target and the user's current trend
 * weight, split the calories into protein / fat / carbohydrate gram targets using
 * evidence-based, priority-ordered defaults:
 *
 *   1. Protein is the priority macro, set per kg of body weight (higher in a
 *      deficit to protect lean mass), and capped so it can't dominate a tiny target.
 *   2. Fat is set per kg, but trimmed toward a hormonal-health floor if the calories
 *      left after protein don't allow the full amount.
 *   3. Carbohydrate fills whatever calories remain (never negative).
 *
 * Pure: no I/O, deterministic. 4 kcal/g protein & carbs, 9 kcal/g fat.
 */

export type MacroGoalMode = "loss" | "maintain" | "gain";

export interface MacroTargetInput {
  /** Recommended kcal/day (already floored/capped by calorieTarget()). */
  readonly calorieTarget: number;
  /** Current trend weight in kg (protein/fat are scaled per kg). */
  readonly trendWeightKg: number;
  /** Whether the plan is a deficit, maintenance, or surplus. */
  readonly mode: MacroGoalMode;
}

export interface MacroTargets {
  readonly proteinG: number;
  readonly fatG: number;
  readonly carbsG: number;
  readonly proteinKcal: number;
  readonly fatKcal: number;
  readonly carbsKcal: number;
}

/** kcal per gram of each macronutrient. */
export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

/** Classify the plan relative to maintenance (TDEE) to pick protein density. */
export function deriveMacroMode(calorieTarget: number, tdee: number): MacroGoalMode {
  if (calorieTarget < tdee - 30) return "loss";
  if (calorieTarget > tdee + 30) return "gain";
  return "maintain";
}

/**
 * Split a calorie target into protein/fat/carb gram targets. Returns undefined only
 * if the inputs are non-finite or non-positive (caller should treat as "no target").
 */
export function macroTargets(input: MacroTargetInput): MacroTargets | undefined {
  const { calorieTarget, trendWeightKg, mode } = input;
  if (!Number.isFinite(calorieTarget) || calorieTarget <= 0) return undefined;
  if (!Number.isFinite(trendWeightKg) || trendWeightKg <= 0) return undefined;

  const w = trendWeightKg;
  const proteinPerKg = mode === "loss" ? 2.0 : 1.8;
  const fatPerKg = 0.9;
  const fatFloorPerKg = 0.6;

  // 1) Protein — priority macro, but capped at 40% of calories on very small targets.
  let proteinKcal = Math.round(proteinPerKg * w) * KCAL_PER_G.protein;
  if (proteinKcal > 0.4 * calorieTarget) proteinKcal = 0.4 * calorieTarget;
  const proteinG = Math.round(proteinKcal / KCAL_PER_G.protein);
  proteinKcal = proteinG * KCAL_PER_G.protein;

  // 2) Fat — per kg, trimmed toward the floor if calories are tight.
  let fatKcal = Math.round(fatPerKg * w) * KCAL_PER_G.fat;
  let remaining = calorieTarget - proteinKcal - fatKcal;
  if (remaining < 0) {
    const fatFloorKcal = Math.round(fatFloorPerKg * w) * KCAL_PER_G.fat;
    fatKcal = Math.max(fatFloorKcal, calorieTarget - proteinKcal);
    if (fatKcal < 0) fatKcal = 0;
  }
  const fatG = Math.round(fatKcal / KCAL_PER_G.fat);
  fatKcal = fatG * KCAL_PER_G.fat;

  // 3) Carbs — fill the remainder, never negative.
  remaining = calorieTarget - proteinKcal - fatKcal;
  const carbsKcal = Math.max(0, remaining);
  const carbsG = Math.round(carbsKcal / KCAL_PER_G.carbs);

  return {
    proteinG,
    fatG,
    carbsG,
    proteinKcal,
    fatKcal,
    carbsKcal: carbsG * KCAL_PER_G.carbs,
  };
}
