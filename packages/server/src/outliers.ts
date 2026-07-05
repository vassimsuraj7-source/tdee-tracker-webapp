import { addDays, detectWeightOutliers, type WeightOutlier } from "@tdee/engine";
import type { SupabaseClient } from "./db.js";
import { loadWeights } from "./repository.js";

export interface WeightOutlierResult {
  outliers: WeightOutlier[];
}

/**
 * Detect implausible weight entries. Detection runs over the full history (so a
 * point's neighbours are always available), but only outliers within the recent
 * window are surfaced — old, already-lived-with data isn't worth nagging about.
 */
export async function getWeightOutliers(client: SupabaseClient, today: string, recentDays = 120): Promise<WeightOutlierResult> {
  const weights = await loadWeights(client);
  const all = detectWeightOutliers(weights);
  const cutoff = addDays(today, -recentDays);
  return { outliers: all.filter((o) => o.date >= cutoff) };
}
