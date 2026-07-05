import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServiceClient } from "./db.js";
import { getDashboard, getTdeeHistory, triggerRecompute } from "./dashboard.js";
import { enumerateDays } from "@tdee/engine";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY && !!process.env.SUPABASE_URL;
const suite = canRun ? describe : describe.skip;

suite("dashboard service (live DB)", () => {
  const client = createServiceClient();
  const TODAY = "2021-07-12";
  const calorieDays = enumerateDays("2021-07-01", "2021-07-12"); // 12 valid days
  const weightDays = enumerateDays("2021-06-25", "2021-07-12");
  let originalTarget: Record<string, unknown> | undefined;

  async function cleanup() {
    await client.from("calorie_entries").delete().gte("entry_date", "2021-06-20").lte("entry_date", "2021-07-31");
    await client.from("weight_entries").delete().gte("entry_date", "2021-06-20").lte("entry_date", "2021-07-31");
    await client.from("body_fat_entries").delete().gte("entry_date", "2021-06-20").lte("entry_date", "2021-07-31");
    await client.from("step_entries").delete().gte("entry_date", "2021-06-20").lte("entry_date", "2021-07-31");
    await client.from("tdee_records").delete().gte("window_end", "2021-06-01").lte("window_end", "2021-07-31");
  }

  beforeAll(async () => {
    const { data } = await client.from("current_target").select("*").eq("id", 1);
    originalTarget = data?.[0] as Record<string, unknown> | undefined;
    await cleanup();
    await client
      .from("calorie_entries")
      .upsert(calorieDays.map((d) => ({ entry_date: d, calories: 2500 })), { onConflict: "entry_date" });
    await client
      .from("weight_entries")
      .upsert(weightDays.map((d) => ({ entry_date: d, value_kg: 80 })), { onConflict: "entry_date" });
    await client.from("step_entries").upsert([{ entry_date: "2021-07-12", steps: 9000 }], { onConflict: "entry_date" });
    await client
      .from("body_fat_entries")
      .upsert([{ entry_date: "2021-07-12", value_fraction: 0.18 }], { onConflict: "entry_date" });
  });

  afterAll(async () => {
    await cleanup();
    if (originalTarget) await client.from("current_target").update(originalTarget).eq("id", 1);
  });

  it("assembles the dashboard aggregate with latest values and 7-day averages (Req 17)", async () => {
    const d = await getDashboard(client, TODAY);
    expect(d.weight.latest?.date).toBe("2021-07-12");
    expect(d.weight.latest?.value).toBe(80);
    expect(d.weight.average7d).toBeCloseTo(80, 6);
    expect(d.bodyfat.latest?.value).toBeCloseTo(0.18, 6);
    expect(d.steps.latest?.value).toBe(9000);
    expect(d.calories.latest?.value).toBe(2500);
  });

  it("triggerRecompute updates TDEE + target, and history is returned (Req 15.3, 5.5)", async () => {
    const res = await triggerRecompute(client, TODAY);
    expect(res.tdeeSource).toBe("data-driven");
    expect(res.currentTdee!).toBeCloseTo(2500, 0);

    const history = await getTdeeHistory(client);
    expect(history.some((h) => h.windowEnd === "2021-07-12")).toBe(true);

    const d = await getDashboard(client, TODAY);
    expect(d.tdee.value!).toBeCloseTo(2500, 0);
    expect(d.tdee.source).toBe("data-driven");
    // maintenance target (no goal) at/above the floor
    expect(d.calorieTarget.value!).toBeGreaterThanOrEqual(1200);
    expect(d.syncTimestamp === null || typeof d.syncTimestamp === "string").toBe(true);
  });
});
