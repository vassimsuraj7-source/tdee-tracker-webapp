import { addDays } from "@tdee/engine";
import type { SupabaseClient } from "./db.js";
import { loadCalories, loadWeights } from "./repository.js";

export type TdeeConfidence = "high" | "good" | "limited";

export interface DataQuality {
  /** Window used for the coverage counts. */
  windowDays: number;
  calorieDaysLogged: number;
  weightDaysLogged: number;
  /** Valid calorie days in the most recent 12-day TDEE window. */
  validCalorieDays12: number;
  /** Confidence in the data-driven TDEE given recent coverage. */
  confidence: TdeeConfidence;
}

/**
 * Summarise how complete the recent data is, so the user knows how much to trust
 * the TDEE. Confidence keys off the data-driven method's own requirement (≥7 valid
 * calorie days within a 12-day window): ≥10 = high, 7–9 = good, <7 = limited
 * (TDEE likely falls back to the BMR estimate).
 */
export async function getDataQuality(client: SupabaseClient, today: string, windowDays = 30): Promise<DataQuality> {
  const [calories, weights] = await Promise.all([loadCalories(client), loadWeights(client)]);

  const start = addDays(today, -(windowDays - 1));
  const start12 = addDays(today, -11);

  const calorieDaysLogged = calories.filter((c) => c.value > 0 && c.date >= start && c.date <= today).length;
  const weightDaysLogged = weights.filter((w) => w.value > 0 && w.date >= start && w.date <= today).length;
  const validCalorieDays12 = calories.filter((c) => c.value > 0 && c.date >= start12 && c.date <= today).length;

  const confidence: TdeeConfidence = validCalorieDays12 >= 10 ? "high" : validCalorieDays12 >= 7 ? "good" : "limited";

  return { windowDays, calorieDaysLogged, weightDaysLogged, validCalorieDays12, confidence };
}
