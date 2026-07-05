/**
 * Plateau assessment — deliberately grounded, not mythologised.
 *
 * A weight-loss plateau overwhelmingly reflects the calorie deficit closing, not a
 * "broken" or "starvation-mode" metabolism:
 *   - Energy needs fall as body mass drops, so a fixed intake becomes maintenance.
 *   - Reported intake drifts up / is under-recorded (documented at ~40–50% on
 *     average in "diet-resistant" subjects; Lichtenstein & Heymsfield, NEJM 1992).
 *   - Adaptive thermogenesis (a drop in expenditure beyond that predicted by lost
 *     mass) is real but modest (~tens of kcal/day) and inconsistently measured
 *     across systematic reviews — it slows loss slightly, it does not halt it.
 *
 * Because this app *derives* TDEE from actual intake and weight change, a flat trend
 * means intake ≈ expenditure by definition — so we can state "the deficit has
 * closed" as fact rather than speculate about metabolism. This function only
 * classifies; the wording/citations live in the UI.
 */

export type PlateauStatus = "none" | "insufficient_data" | "progressing" | "plateau";

export interface PlateauInput {
  readonly hasWeightGoal: boolean;
  readonly goalReached: boolean;
  /** Trend-based weekly rate of weight change (kg/week), or null if unknown. */
  readonly weeklyRateKg: number | null;
  /** Baseline window (days) over which the rate was measured, or null. */
  readonly windowDays: number | null;
  readonly avgIntakeKcal: number | null;
  readonly measuredTdee: number | null;
  readonly tdeeSource: string | null;
  /** Active diet phase. A flat trend during maintain/recomp is the intent, not a plateau. */
  readonly phase?: string;
}

export interface PlateauAssessment {
  readonly status: PlateauStatus;
  /** Approx maintenance calories at the current stable weight (kcal/day). */
  readonly maintenanceKcal: number | null;
  readonly weeklyRateKg: number | null;
  readonly windowDays: number | null;
}

/** A trend within ±0.1 kg/week is treated as flat (a real deficit moves faster). */
export const PLATEAU_FLAT_KG_PER_WEEK = 0.1;
/** Need at least two weeks of trend to call something a plateau vs. noise. */
export const PLATEAU_MIN_WINDOW_DAYS = 14;

export function assessPlateau(i: PlateauInput): PlateauAssessment {
  const base = { maintenanceKcal: null, weeklyRateKg: i.weeklyRateKg, windowDays: i.windowDays } as const;

  // A flat weight trend is the *goal* during maintenance and (largely) recomposition,
  // so it must never be reported as a plateau there.
  if (i.phase === "maintain" || i.phase === "recomp") return { ...base, status: "none" };

  if (!i.hasWeightGoal || i.goalReached) return { ...base, status: "none" };
  if (i.weeklyRateKg == null || i.windowDays == null || i.windowDays < PLATEAU_MIN_WINDOW_DAYS) {
    return { ...base, status: "insufficient_data" };
  }

  if (Math.abs(i.weeklyRateKg) < PLATEAU_FLAT_KG_PER_WEEK) {
    // At a stable weight, measured (data-driven) TDEE is the truest maintenance
    // figure; otherwise fall back to average intake, then the estimate.
    const maintenanceKcal =
      i.tdeeSource === "data-driven" && i.measuredTdee != null
        ? Math.round(i.measuredTdee)
        : i.avgIntakeKcal != null
          ? Math.round(i.avgIntakeKcal)
          : i.measuredTdee != null
            ? Math.round(i.measuredTdee)
            : null;
    return { status: "plateau", maintenanceKcal, weeklyRateKg: i.weeklyRateKg, windowDays: i.windowDays };
  }

  return { ...base, status: "progressing" };
}
