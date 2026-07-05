import type { SupabaseClient } from "./db.js";

export interface FullExport {
  exportedAt: string;
  weight: { entry_date: string; value_kg: number }[];
  bodyFat: { entry_date: string; value_fraction: number }[];
  steps: { entry_date: string; steps: number }[];
  calories: {
    entry_date: string;
    calories: number;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
    fiber_g: number | null;
  }[];
  profile: Record<string, unknown> | null;
  goals: Record<string, unknown>[];
  tdee: { window_start: string; window_end: string; value: number; valid_days: number }[];
}

function rows<T>(res: { data: T[] | null; error: { message: string } | null }): T[] {
  if (res.error) throw new Error(res.error.message);
  return res.data ?? [];
}

/** Gather all of the account's data for a backup/export (read-only). */
export async function getFullExport(client: SupabaseClient): Promise<FullExport> {
  const [weight, bodyFat, steps, calories, profile, goals, tdee] = await Promise.all([
    client.from("weight_entries").select("entry_date, value_kg").order("entry_date"),
    client.from("body_fat_entries").select("entry_date, value_fraction").order("entry_date"),
    client.from("step_entries").select("entry_date, steps").order("entry_date"),
    client.from("calorie_entries").select("entry_date, calories, protein_g, carbs_g, fat_g, fiber_g").order("entry_date"),
    client.from("user_profile").select("name, date_of_birth, height_cm, gender, activity_pal, calorie_goal").eq("id", 1).limit(1),
    client.from("user_goals").select("goal_type, order_index, target_value, goal_date, is_completed, completion_date, current_value_at_set, date_set").order("goal_type").order("order_index"),
    client.from("tdee_records").select("window_start, window_end, value, valid_days").order("window_end"),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    weight: rows(weight) as FullExport["weight"],
    bodyFat: rows(bodyFat) as FullExport["bodyFat"],
    steps: rows(steps) as FullExport["steps"],
    calories: rows(calories) as FullExport["calories"],
    profile: (rows(profile)[0] as Record<string, unknown>) ?? null,
    goals: rows(goals) as Record<string, unknown>[],
    tdee: rows(tdee) as FullExport["tdee"],
  };
}
