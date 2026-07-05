import type { DatedValue } from "@tdee/engine";
import type { SupabaseClient } from "./db.js";

/** The user's profile row (singleton, id = 1). */
export interface ProfileRow {
  name: string | null;
  date_of_birth: string | null; // ISO date
  height_cm: number | null;
  gender: "male" | "female" | "other" | null;
  activity_pal: number | null;
  calorie_goal: number | null;
}

/** An active weight Main_Goal (order_index = -1). */
export interface WeightMainGoal {
  targetWeightKg: number;
  targetDate: string | null; // ISO date
}

/** A computed TDEE record ready to persist. */
export interface TdeeRecordRow {
  window_start: string;
  window_end: string;
  value: number;
  valid_days: number;
}

/** The current calorie-target snapshot to persist (singleton, id = 1). */
export interface CurrentTargetRow {
  calorie_target: number | null;
  tdee_used: number | null;
  tdee_source: "data-driven" | "estimated" | "undetermined";
  rate_capped: boolean;
  date_unachievable: boolean;
  warning: string | null;
}

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

/** Load all weight entries as engine-shaped {date, value} (kg), ascending. */
export async function loadWeights(client: SupabaseClient): Promise<DatedValue[]> {
  const rows = unwrap(
    await client.from("weight_entries").select("entry_date, value_kg").order("entry_date"),
  ) as { entry_date: string; value_kg: number }[];
  return rows.map((r) => ({ date: r.entry_date, value: r.value_kg }));
}

/** Load all calorie entries as engine-shaped {date, value} (kcal), ascending. */
export async function loadCalories(client: SupabaseClient): Promise<DatedValue[]> {
  const rows = unwrap(
    await client.from("calorie_entries").select("entry_date, calories").order("entry_date"),
  ) as { entry_date: string; calories: number }[];
  return rows.map((r) => ({ date: r.entry_date, value: r.calories }));
}

/** Load the singleton profile, or null if it has no meaningful data yet. */
export async function loadProfile(client: SupabaseClient): Promise<ProfileRow | null> {
  const rows = unwrap(
    await client
      .from("user_profile")
      .select("name, date_of_birth, height_cm, gender, activity_pal, calorie_goal")
      .eq("id", 1)
      .limit(1),
  ) as ProfileRow[];
  return rows[0] ?? null;
}

/** Load the active weight Main_Goal (order_index = -1, not completed), or null. */
export async function loadWeightMainGoal(client: SupabaseClient): Promise<WeightMainGoal | null> {
  const rows = unwrap(
    await client
      .from("user_goals")
      .select("target_value, goal_date")
      .eq("goal_type", "weight")
      .eq("order_index", -1)
      .eq("is_completed", false)
      .limit(1),
  ) as { target_value: number; goal_date: string | null }[];
  const row = rows[0];
  if (!row) return null;
  return { targetWeightKg: row.target_value, targetDate: row.goal_date };
}

/** Upsert TDEE records keyed by window_end (Req 15.2). */
export async function upsertTdeeRecords(
  client: SupabaseClient,
  records: TdeeRecordRow[],
): Promise<void> {
  if (records.length === 0) return;
  const { error } = await client.from("tdee_records").upsert(records, { onConflict: "window_end" });
  if (error) throw new Error(error.message);
}

/** Persist the current calorie-target snapshot (singleton, id = 1). */
export async function saveCurrentTarget(
  client: SupabaseClient,
  snapshot: CurrentTargetRow,
): Promise<void> {
  const { error } = await client
    .from("current_target")
    .update({ ...snapshot, computed_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) throw new Error(error.message);
}

/** Read the last sync timestamp (Req 17.4), or null. */
export async function getSyncTimestamp(client: SupabaseClient): Promise<string | null> {
  const rows = unwrap(
    await client.from("sync_state").select("last_sync_at").eq("id", 1).limit(1),
  ) as { last_sync_at: string | null }[];
  return rows[0]?.last_sync_at ?? null;
}
