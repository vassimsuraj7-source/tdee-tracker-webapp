import { addDays, macroTargets, deriveMacroMode, type MacroTargets } from "@tdee/engine";
import type { SupabaseClient } from "./db.js";
import { getSyncTimestamp } from "./repository.js";
import { runRecompute } from "./recompute.js";

export interface MetricSummary {
  latest: { date: string; value: number } | null;
  /** 7-day simple moving average of entries in the last 7 days, or null if none. */
  average7d: number | null;
}

export interface DashboardData {
  weight: MetricSummary;
  bodyfat: MetricSummary;
  steps: { latest: { date: string; value: number } | null };
  calories: { latest: { date: string; value: number } | null };
  tdee: { value: number | null; source: string | null };
  calorieTarget: {
    value: number | null;
    rateCapped: boolean;
    dateUnachievable: boolean;
    warning: string | null;
  };
  /** Derived protein/fat/carb gram targets for the calorie target; null if not computable. */
  macros: MacroTargets | null;
  syncTimestamp: string | null;
}

async function latestEntry(
  client: SupabaseClient,
  table: string,
  valueCol: string,
): Promise<{ date: string; value: number } | null> {
  const { data, error } = await client
    .from(table)
    .select(`entry_date, ${valueCol}`)
    .order("entry_date", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const row = data?.[0] as unknown as Record<string, unknown> | undefined;
  if (!row) return null;
  return { date: row.entry_date as string, value: row[valueCol] as number };
}

async function movingAverage7d(
  client: SupabaseClient,
  table: string,
  valueCol: string,
  today: string,
): Promise<number | null> {
  const start = addDays(today, -6);
  const { data, error } = await client
    .from(table)
    .select(valueCol)
    .gte("entry_date", start)
    .lte("entry_date", today);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const values = rows.map((r) => r[valueCol] as number);
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** Assemble the dashboard aggregate the frontend renders (Req 17.1-17.4, 16.6). */
export async function getDashboard(client: SupabaseClient, today: string): Promise<DashboardData> {
  const [
    weightLatest,
    weightAvg,
    bodyfatLatest,
    bodyfatAvg,
    stepsLatest,
    caloriesLatest,
    syncTimestamp,
  ] = await Promise.all([
    latestEntry(client, "weight_entries", "value_kg"),
    movingAverage7d(client, "weight_entries", "value_kg", today),
    latestEntry(client, "body_fat_entries", "value_fraction"),
    movingAverage7d(client, "body_fat_entries", "value_fraction", today),
    latestEntry(client, "step_entries", "steps"),
    latestEntry(client, "calorie_entries", "calories"),
    getSyncTimestamp(client),
  ]);

  const { data: ctData, error: ctErr } = await client
    .from("current_target")
    .select("calorie_target, tdee_used, tdee_source, rate_capped, date_unachievable, warning")
    .eq("id", 1)
    .limit(1);
  if (ctErr) throw new Error(ctErr.message);
  const ct = ctData?.[0] as
    | {
        calorie_target: number | null;
        tdee_used: number | null;
        tdee_source: string | null;
        rate_capped: boolean;
        date_unachievable: boolean;
        warning: string | null;
      }
    | undefined;

  // Derive macro targets from the calorie target + trend weight (7-day avg proxy) +
  // TDEE (to classify deficit/maintenance/surplus). Pure engine call, no DB change.
  const target = ct?.calorie_target ?? null;
  const tdeeVal = ct?.tdee_used ?? null;
  let macros: MacroTargets | null = null;
  if (target != null && tdeeVal != null && weightAvg != null) {
    macros = macroTargets({
      calorieTarget: target,
      trendWeightKg: weightAvg,
      mode: deriveMacroMode(target, tdeeVal),
    }) ?? null;
  }

  return {
    weight: { latest: weightLatest, average7d: weightAvg },
    bodyfat: { latest: bodyfatLatest, average7d: bodyfatAvg },
    steps: { latest: stepsLatest },
    calories: { latest: caloriesLatest },
    tdee: { value: ct?.tdee_used ?? null, source: ct?.tdee_source ?? null },
    calorieTarget: {
      value: ct?.calorie_target ?? null,
      rateCapped: ct?.rate_capped ?? false,
      dateUnachievable: ct?.date_unachievable ?? false,
      warning: ct?.warning ?? null,
    },
    macros,
    syncTimestamp,
  };
}

export interface TdeeHistoryPoint {
  windowEnd: string;
  windowStart: string;
  value: number;
  validDays: number;
}

/** All stored TDEE records ordered by end date (Req 15.3). */
export async function getTdeeHistory(client: SupabaseClient): Promise<TdeeHistoryPoint[]> {
  const { data, error } = await client
    .from("tdee_records")
    .select("window_end, window_start, value, valid_days")
    .order("window_end");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    windowEnd: r.window_end as string,
    windowStart: r.window_start as string,
    value: r.value as number,
    validDays: r.valid_days as number,
  }));
}

/** On-demand recompute trigger — the web equivalent of the native pull-to-refresh. */
export async function triggerRecompute(client: SupabaseClient, today: string) {
  return runRecompute(client, today);
}
