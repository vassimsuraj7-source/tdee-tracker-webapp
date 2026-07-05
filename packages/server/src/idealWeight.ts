import { fillMissingWeightData, trendWeight, healthyWeightRangeKg, bmi, suggestTargetDate } from "@tdee/engine";
import type { SupabaseClient } from "./db.js";
import { getProfile } from "./profile.js";
import { loadWeights } from "./repository.js";

export interface HealthyWeightSuggestion {
  /** Healthy weight range (kg) from the WHO healthy BMI band (18.5–24.9). */
  lowKg: number | null;
  highKg: number | null;
  midpointKg: number | null;
  currentWeightKg: number | null;
  currentBmi: number | null;
  /** Whether the current weight sits within the healthy range. */
  inRange: boolean | null;
  /** If outside the range, the nearest healthy edge to aim for (else null). */
  suggestedTargetKg: number | null;
  /** Suggested date to reach that edge at a healthy pace (else null). */
  suggestedDate: string | null;
  /** Profile fields still needed (height / gender). Empty when computable. */
  missing: string[];
}

/**
 * Suggest a healthy weight *range* (not a single "ideal") and, only if the user is
 * outside it, the nearest healthy edge as an actionable target with a date. Uses
 * current trend weight when available, else the latest logged weight.
 */
export async function getIdealWeightSuggestion(client: SupabaseClient, today: string): Promise<HealthyWeightSuggestion> {
  const profile = await getProfile(client, today);
  const weights = await loadWeights(client);

  let currentWeightKg: number | null = null;
  if (weights.length > 0) {
    const filled = fillMissingWeightData(weights, weights[0]!.date, today);
    const trend = trendWeight(filled, today, 7);
    currentWeightKg = trend ?? weights[weights.length - 1]!.value;
  }

  const missing: string[] = [];
  if (profile.heightCm == null) missing.push("height");

  if (profile.heightCm == null) {
    return {
      lowKg: null, highKg: null, midpointKg: null, currentWeightKg,
      currentBmi: null, inRange: null, suggestedTargetKg: null, suggestedDate: null, missing,
    };
  }

  const range = healthyWeightRangeKg(profile.heightCm);
  const currentBmi = currentWeightKg != null ? bmi(currentWeightKg, profile.heightCm) : null;

  let inRange: boolean | null = null;
  let suggestedTargetKg: number | null = null;
  let suggestedDate: string | null = null;
  if (currentWeightKg != null) {
    inRange = currentWeightKg >= range.lowKg && currentWeightKg <= range.highKg;
    if (!inRange) {
      suggestedTargetKg = currentWeightKg > range.highKg ? range.highKg : range.lowKg;
      suggestedDate = suggestTargetDate(currentWeightKg, suggestedTargetKg, profile.heightCm, today);
    }
  }

  return {
    lowKg: range.lowKg,
    highKg: range.highKg,
    midpointKg: range.midpointKg,
    currentWeightKg,
    currentBmi,
    inRange,
    suggestedTargetKg,
    suggestedDate,
    missing,
  };
}
