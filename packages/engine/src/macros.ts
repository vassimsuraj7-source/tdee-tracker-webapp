/**
 * Macro target ranges (evidence-based, not hard limits).
 *
 * The literature expresses macronutrient needs as ranges, not single numbers, so
 * this returns a low–high band for each macro:
 *
 *   Protein — scaled per kg of body weight by activity level. The RDA (0.8 g/kg)
 *     only prevents deficiency; general active adults do well at ~1.2–1.6 g/kg, and
 *     only muscle-building / heavy resistance training (or dieting, to spare lean
 *     mass) warrants the 1.6–2.2 g/kg top end (ISSN position stand, 2017).
 *   Fat — 20–35% of calories (IOM AMDR; WHO ≤30% for weight control), with a
 *     ~0.5 g/kg floor for essential fatty acids / hormonal health.
 *   Carbohydrate — fills the remaining calories (IOM AMDR ~45–65% is typical); it
 *     has no absolute requirement, so it's presented as the residual band.
 *
 * Pure & deterministic. 4 kcal/g protein & carbs, 9 kcal/g fat.
 */

export type MacroGoalMode = "loss" | "maintain" | "gain";

export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

export interface MacroTargetInput {
  /** Recommended kcal/day (already floored/capped by calorieTarget()). */
  readonly calorieTarget: number;
  /** Current trend weight in kg (protein/fat are scaled per kg). */
  readonly trendWeightKg: number;
  /** Activity PAL (1.2 sedentary … 1.9 extremely active); tiers the protein range. */
  readonly activityPal: number;
  /** Whether the plan is a deficit, maintenance, or surplus. */
  readonly mode: MacroGoalMode;
}

export interface MacroRange {
  readonly lowG: number;
  readonly highG: number;
  readonly lowKcal: number;
  readonly highKcal: number;
}

export interface MacroTargets {
  readonly protein: MacroRange;
  readonly fat: MacroRange;
  readonly carbs: MacroRange;
  /** The protein band in g/kg that produced the range (for display/explanation). */
  readonly proteinPerKg: { readonly low: number; readonly high: number };
  /** The fat band as % of calories used (for display/explanation). */
  readonly fatPercent: { readonly low: number; readonly high: number };
}

/** Classify the plan relative to maintenance (TDEE) to pick the protein band. */
export function deriveMacroMode(calorieTarget: number, tdee: number): MacroGoalMode {
  if (calorieTarget < tdee - 30) return "loss";
  if (calorieTarget > tdee + 30) return "gain";
  return "maintain";
}

/**
 * Protein band (g/kg) by activity level, nudged up in a deficit to preserve lean
 * mass. Sedentary people top out modestly; only genuinely active / training people
 * reach the high end — so the recommendation isn't "maximal protein for everyone".
 */
function proteinPerKgRange(activityPal: number, mode: MacroGoalMode): { low: number; high: number } {
  let low: number;
  let high: number;
  if (activityPal <= 1.4) {
    low = 1.2; // sedentary / lightly active: comfortably above the 0.8 RDA
    high = 1.6;
  } else if (activityPal < 1.725) {
    low = 1.4; // moderately active
    high = 1.8;
  } else {
    low = 1.6; // very / extremely active (incl. resistance training)
    high = 2.2;
  }
  if (mode === "loss") {
    // A calorie deficit raises protein needs to protect muscle.
    low += 0.2;
    high = Math.min(2.4, high + 0.2);
  }
  return { low, high };
}

/**
 * Compute protein / fat / carb gram ranges for a calorie target. Returns undefined
 * only if inputs are non-finite or non-positive.
 */
export function macroTargets(input: MacroTargetInput): MacroTargets | undefined {
  const { calorieTarget, trendWeightKg, activityPal, mode } = input;
  if (!Number.isFinite(calorieTarget) || calorieTarget <= 0) return undefined;
  if (!Number.isFinite(trendWeightKg) || trendWeightKg <= 0) return undefined;

  const w = trendWeightKg;

  // Protein — per kg, activity-tiered.
  const pPerKg = proteinPerKgRange(activityPal > 0 ? activityPal : 1.55, mode);
  const proteinLowG = Math.round(pPerKg.low * w);
  const proteinHighG = Math.round(pPerKg.high * w);

  // Fat — 20–35% of calories, with a 0.5 g/kg essential-fat floor.
  const fatLowG = Math.round(Math.max(0.5 * w, (0.2 * calorieTarget) / KCAL_PER_G.fat));
  let fatHighG = Math.round((0.35 * calorieTarget) / KCAL_PER_G.fat);
  if (fatHighG < fatLowG) fatHighG = fatLowG;

  const pLowKcal = proteinLowG * KCAL_PER_G.protein;
  const pHighKcal = proteinHighG * KCAL_PER_G.protein;
  const fLowKcal = fatLowG * KCAL_PER_G.fat;
  const fHighKcal = fatHighG * KCAL_PER_G.fat;

  // Carbs fill the remaining calories: most carbs when protein & fat are at their
  // lows, fewest when both are at their highs. Never negative.
  const carbsHighG = Math.round(Math.max(0, calorieTarget - pLowKcal - fLowKcal) / KCAL_PER_G.carbs);
  const carbsLowG = Math.round(Math.max(0, calorieTarget - pHighKcal - fHighKcal) / KCAL_PER_G.carbs);

  return {
    protein: { lowG: proteinLowG, highG: proteinHighG, lowKcal: pLowKcal, highKcal: pHighKcal },
    fat: { lowG: fatLowG, highG: fatHighG, lowKcal: fLowKcal, highKcal: fHighKcal },
    carbs: { lowG: carbsLowG, highG: carbsHighG, lowKcal: carbsLowG * KCAL_PER_G.carbs, highKcal: carbsHighG * KCAL_PER_G.carbs },
    proteinPerKg: pPerKg,
    fatPercent: { low: 20, high: 35 },
  };
}
