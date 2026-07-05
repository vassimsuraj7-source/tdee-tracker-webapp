import type { SupabaseClient } from "./db.js";
import { NotFoundError, ValidationError } from "./errors.js";

export type GoalType = "weight" | "body_fat" | "steps";
export const MAIN_GOAL_ORDER = -1;

export interface GoalRow {
  id: string;
  goal_type: GoalType;
  target_value: number;
  goal_date: string | null;
  order_index: number;
  current_value_at_set: number | null;
  is_completed: boolean;
  completion_date: string | null;
  date_set: string;
}

export interface GoalInput {
  targetValue: number;
  goalDate?: string | null;
  currentValueAtSet?: number | null;
}

function assertTarget(value: number): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new ValidationError("goal target must be a non-negative number");
  }
}

/** List all goals for a type ordered by order_index (main goal first at -1) (Req 9.2). */
export async function listGoals(client: SupabaseClient, goalType: GoalType): Promise<GoalRow[]> {
  const { data, error } = await client
    .from("user_goals")
    .select("*")
    .eq("goal_type", goalType)
    .order("order_index");
  if (error) throw new Error(error.message);
  return (data ?? []) as GoalRow[];
}

/** The active (not completed) main goal for a type, or null (Req 8.4). */
export async function getMainGoal(
  client: SupabaseClient,
  goalType: GoalType,
): Promise<GoalRow | null> {
  const { data, error } = await client
    .from("user_goals")
    .select("*")
    .eq("goal_type", goalType)
    .eq("order_index", MAIN_GOAL_ORDER)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data?.[0] as GoalRow | undefined) ?? null;
}

/**
 * Create or replace the single main goal for a type (order_index = -1) (Req 8.1, 8.2).
 * Replaces any existing main goal rather than adding a second.
 */
export async function setMainGoal(
  client: SupabaseClient,
  goalType: GoalType,
  input: GoalInput,
): Promise<GoalRow> {
  assertTarget(input.targetValue);
  const existing = await getMainGoal(client, goalType);

  if (existing) {
    const { data, error } = await client
      .from("user_goals")
      .update({
        target_value: input.targetValue,
        goal_date: input.goalDate ?? null,
        current_value_at_set: input.currentValueAtSet ?? existing.current_value_at_set,
        is_completed: false,
        completion_date: null,
      })
      .eq("id", existing.id)
      .select()
      .limit(1);
    if (error) throw new Error(error.message);
    return data![0] as GoalRow;
  }

  const { data, error } = await client
    .from("user_goals")
    .insert({
      goal_type: goalType,
      target_value: input.targetValue,
      goal_date: input.goalDate ?? null,
      order_index: MAIN_GOAL_ORDER,
      current_value_at_set: input.currentValueAtSet ?? null,
    })
    .select()
    .limit(1);
  if (error) throw new Error(error.message);
  return data![0] as GoalRow;
}

/** Delete the main goal for a type (Req 8.3). */
export async function deleteMainGoal(client: SupabaseClient, goalType: GoalType): Promise<void> {
  const { error } = await client
    .from("user_goals")
    .delete()
    .eq("goal_type", goalType)
    .eq("order_index", MAIN_GOAL_ORDER);
  if (error) throw new Error(error.message);
}

/**
 * Add a subgoal with the next positive order_index for the type (Req 9.1):
 * one greater than the current highest positive order_index.
 */
export async function addSubgoal(
  client: SupabaseClient,
  goalType: GoalType,
  input: GoalInput,
): Promise<GoalRow> {
  assertTarget(input.targetValue);
  const { data: maxData, error: maxErr } = await client
    .from("user_goals")
    .select("order_index")
    .eq("goal_type", goalType)
    .gt("order_index", 0)
    .order("order_index", { ascending: false })
    .limit(1);
  if (maxErr) throw new Error(maxErr.message);
  const nextIndex = ((maxData?.[0]?.order_index as number | undefined) ?? 0) + 1;

  const { data, error } = await client
    .from("user_goals")
    .insert({
      goal_type: goalType,
      target_value: input.targetValue,
      goal_date: input.goalDate ?? null,
      order_index: nextIndex,
      current_value_at_set: input.currentValueAtSet ?? null,
    })
    .select()
    .limit(1);
  if (error) throw new Error(error.message);
  return data![0] as GoalRow;
}

/** Mark a subgoal completed, recording the completion date (Req 9.3). */
export async function completeSubgoal(client: SupabaseClient, id: string): Promise<void> {
  const { data, error } = await client
    .from("user_goals")
    .update({ is_completed: true, completion_date: new Date().toISOString() })
    .eq("id", id)
    .select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new NotFoundError("subgoal not found");
}

/** Delete a subgoal without reindexing the others (Req 9.4). */
export async function deleteSubgoal(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from("user_goals").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
