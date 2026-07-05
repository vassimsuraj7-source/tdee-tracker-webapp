import type { IsoDate, TdeeSource } from "./types.js";
import { CALORIE_TARGET_FLOOR, KCAL_PER_KG } from "./types.js";
import { diffDays } from "./date.js";
import { permittedWeeklyChangeKg, isLossDisallowed } from "./guardrails.js";

export interface WeightGoal {
  readonly targetWeightKg: number;
  readonly targetDate: IsoDate;
}

export interface CalorieTargetInput {
  /** Current TDEE (data-driven preferred, else estimated); undefined if none. */
  readonly currentTdee: number | undefined;
  readonly tdeeSource: TdeeSource;
  /** Most recent Trend_Weight in kg; undefined if not determinable. */
  readonly currentTrendWeightKg: number | undefined;
  readonly heightCm: number;
  /** Active weight Main_Goal, if one exists. */
  readonly goal?: WeightGoal;
  /** Active diet phase, if any. "maintain" forces maintenance (overriding any goal);
   *  "recomp" applies a gentle deficit with high protein; "cut"/"bulk" defer to the goal. */
  readonly phase?: "cut" | "maintain" | "bulk" | "recomp";
  readonly today: IsoDate;
}

export interface CalorieTargetResult {
  /** Recommended kcal/day, or undefined when TDEE is undetermined (Req 16.5). */
  readonly calorieTarget: number | undefined;
  readonly tdeeUsed: number | undefined;
  readonly tdeeSource: TdeeSource;
  /** True when the plan was capped to the healthy weekly rate (Req 16.2). */
  readonly rateCapped: boolean;
  /** True when the goal's target date is not achievable at a healthy pace (Req 16.2). */
  readonly dateUnachievable: boolean;
  /** Present when the goal was overridden for safety (e.g. underweight + loss). */
  readonly warning?: string;
}

/**
 * Compute the recommended daily calorie target (Req 16), constrained by the
 * BMI-tiered healthy weekly rate (Req 10.5) and floored at 1200 kcal (Req 16.3).
 *
 * Behaviour:
 *  - No current TDEE -> undetermined (Req 16.5).
 *  - No goal (or missing current weight) -> maintenance at TDEE (Req 16.4).
 *  - Underweight + loss goal -> refuse the loss, fall back to maintenance (Req 10.4).
 *  - Otherwise -> TDEE +/- the daily adjustment for the required weekly change,
 *    capped at the permitted rate, then floored at 1200.
 */
export function calorieTarget(input: CalorieTargetInput): CalorieTargetResult {
  const { currentTdee, tdeeSource, currentTrendWeightKg, heightCm, goal, phase, today } = input;

  if (currentTdee === undefined) {
    return {
      calorieTarget: undefined,
      tdeeUsed: undefined,
      tdeeSource: "undetermined",
      rateCapped: false,
      dateUnachievable: false,
    };
  }

  const maintenance = (): CalorieTargetResult => ({
    calorieTarget: Math.max(CALORIE_TARGET_FLOOR, currentTdee),
    tdeeUsed: currentTdee,
    tdeeSource,
    rateCapped: false,
    dateUnachievable: false,
  });

  // A maintenance phase intentionally holds weight — eat at TDEE, ignoring any goal.
  if (phase === "maintain") return maintenance();

  // Recomposition: a gentle deficit (fat loss) while high protein + resistance
  // training preserve/build muscle. Evidence favours maintenance-to-modest-deficit;
  // we use ~10% of TDEE capped at 250 kcal (the safe low end). Skip the deficit if
  // weight loss is unsafe (underweight) — fall back to maintenance.
  if (phase === "recomp") {
    if (currentTrendWeightKg !== undefined && isLossDisallowed(currentTrendWeightKg, heightCm)) {
      return {
        ...maintenance(),
        warning: "Recomposition uses a small deficit, which isn't advised at your current BMI; showing maintenance calories.",
      };
    }
    const deficit = Math.min(250, Math.round(currentTdee * 0.1));
    return {
      calorieTarget: Math.max(CALORIE_TARGET_FLOOR, currentTdee - deficit),
      tdeeUsed: currentTdee,
      tdeeSource,
      rateCapped: false,
      dateUnachievable: false,
    };
  }

  // No goal, or we can't anchor to a current weight -> maintenance.
  if (!goal || currentTrendWeightKg === undefined) {
    return maintenance();
  }

  // Underweight + loss goal is refused for safety (Req 10.4).
  if (goal.targetWeightKg < currentTrendWeightKg && isLossDisallowed(currentTrendWeightKg, heightCm)) {
    return {
      ...maintenance(),
      warning: "Weight loss is not recommended at your current BMI; showing maintenance calories.",
    };
  }

  const permitted = permittedWeeklyChangeKg(currentTrendWeightKg, heightCm);
  const totalChange = goal.targetWeightKg - currentTrendWeightKg; // signed kg
  const weeksToGoal = diffDays(today, goal.targetDate) / 7;

  let requiredWeekly: number;
  if (weeksToGoal <= 0) {
    // Target date is today or past — treat as demanding an infinite rate.
    requiredWeekly = totalChange === 0 ? 0 : Math.sign(totalChange) * Infinity;
  } else {
    requiredWeekly = totalChange / weeksToGoal;
  }

  // Cap to the permitted rate for the required direction.
  let cappedWeekly = requiredWeekly;
  let rateCapped = false;
  let dateUnachievable = false;

  if (requiredWeekly < 0) {
    // losing weight
    const maxLoss = permitted.loss; // magnitude
    if (Math.abs(requiredWeekly) > maxLoss) {
      cappedWeekly = -maxLoss;
      rateCapped = true;
      dateUnachievable = true;
    }
  } else if (requiredWeekly > 0) {
    // gaining weight
    const maxGain = permitted.gain; // magnitude
    if (requiredWeekly > maxGain) {
      cappedWeekly = maxGain;
      rateCapped = true;
      dateUnachievable = true;
    }
  }

  const dailyAdjustment = (cappedWeekly * KCAL_PER_KG) / 7;
  const raw = currentTdee + dailyAdjustment;
  const calorieTargetValue = Math.max(CALORIE_TARGET_FLOOR, raw);

  return {
    calorieTarget: calorieTargetValue,
    tdeeUsed: currentTdee,
    tdeeSource,
    rateCapped,
    dateUnachievable,
  };
}
