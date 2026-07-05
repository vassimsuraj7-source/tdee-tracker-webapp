import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServiceClient } from "./db.js";
import {
  listGoals,
  getMainGoal,
  setMainGoal,
  addSubgoal,
  completeSubgoal,
  deleteSubgoal,
  MAIN_GOAL_ORDER,
} from "./goals.js";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY && !!process.env.SUPABASE_URL;
const suite = canRun ? describe : describe.skip;

suite("goals service (live DB)", () => {
  const client = createServiceClient();
  let original: unknown[] = [];

  beforeAll(async () => {
    const { data } = await client.from("user_goals").select("*");
    original = data ?? [];
    await client.from("user_goals").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  });

  afterAll(async () => {
    await client.from("user_goals").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (original.length > 0) {
      await client.from("user_goals").insert(original as never[]);
    }
  });

  it("creates and replaces the single main goal (Req 8.1, 8.2)", async () => {
    await setMainGoal(client, "weight", { targetValue: 70, goalDate: "2021-12-01", currentValueAtSet: 80 });
    let main = await getMainGoal(client, "weight");
    expect(main?.target_value).toBe(70);
    expect(main?.order_index).toBe(MAIN_GOAL_ORDER);

    // Setting again replaces rather than adding a second main goal.
    await setMainGoal(client, "weight", { targetValue: 68, goalDate: "2021-12-15" });
    main = await getMainGoal(client, "weight");
    expect(main?.target_value).toBe(68);

    const mains = (await listGoals(client, "weight")).filter((g) => g.order_index === MAIN_GOAL_ORDER);
    expect(mains).toHaveLength(1);
  });

  it("adds sequential subgoals with increasing order_index (Req 9.1, 9.2)", async () => {
    const s1 = await addSubgoal(client, "weight", { targetValue: 78 });
    const s2 = await addSubgoal(client, "weight", { targetValue: 75 });
    expect(s1.order_index).toBe(1);
    expect(s2.order_index).toBe(2);

    const ordered = (await listGoals(client, "weight")).map((g) => g.order_index);
    expect(ordered).toEqual([MAIN_GOAL_ORDER, 1, 2]);
  });

  it("completes a subgoal with a completion date (Req 9.3)", async () => {
    const s = await addSubgoal(client, "weight", { targetValue: 73 });
    await completeSubgoal(client, s.id);
    const found = (await listGoals(client, "weight")).find((g) => g.id === s.id);
    expect(found?.is_completed).toBe(true);
    expect(found?.completion_date).not.toBeNull();
  });

  it("deletes a subgoal without reindexing others (Req 9.4)", async () => {
    const before = await listGoals(client, "weight");
    const toDelete = before.find((g) => g.order_index === 2)!;
    const other = before.find((g) => g.order_index === 1)!;
    await deleteSubgoal(client, toDelete.id);
    const after = await listGoals(client, "weight");
    expect(after.find((g) => g.id === toDelete.id)).toBeUndefined();
    // the remaining subgoal keeps its original order_index
    expect(after.find((g) => g.id === other.id)?.order_index).toBe(1);
  });
});
