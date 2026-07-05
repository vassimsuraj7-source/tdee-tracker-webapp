import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServiceClient } from "./db.js";
import { runRecompute } from "./recompute.js";
import { enumerateDays } from "@tdee/engine";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY && !!process.env.SUPABASE_URL;
const suite = canRun ? describe : describe.skip;

suite("runRecompute (live DB integration)", () => {
  const client = createServiceClient();
  const TODAY = "2021-01-20";
  const calorieDays = enumerateDays("2021-01-09", "2021-01-20"); // 12 valid days
  const weightDays = enumerateDays("2021-01-03", "2021-01-20"); // covers trend windows
  // Row snapshot of the profile singleton, restored in afterAll.
  let originalProfile: Record<string, unknown> | undefined;

  async function cleanupData() {
    await client.from("calorie_entries").delete().gte("entry_date", "2021-01-01").lte("entry_date", "2021-02-01");
    await client.from("weight_entries").delete().gte("entry_date", "2021-01-01").lte("entry_date", "2021-02-01");
    await client.from("tdee_records").delete().gte("window_end", "2021-01-01").lte("window_end", "2021-02-01");
  }

  beforeAll(async () => {
    const { data } = await client.from("user_profile").select("*").eq("id", 1);
    originalProfile = data?.[0] as Record<string, unknown> | undefined;
    await cleanupData();
    await client
      .from("calorie_entries")
      .upsert(calorieDays.map((d) => ({ entry_date: d, calories: 2500 })), { onConflict: "entry_date" });
    await client
      .from("weight_entries")
      .upsert(weightDays.map((d) => ({ entry_date: d, value_kg: 80 })), { onConflict: "entry_date" });
  });

  afterAll(async () => {
    await cleanupData();
    if (originalProfile) {
      await client.from("user_profile").update(originalProfile).eq("id", 1);
    }
    await client
      .from("current_target")
      .update({
        calorie_target: null,
        tdee_used: null,
        tdee_source: "undetermined",
        rate_capped: false,
        date_unachievable: false,
        warning: null,
      })
      .eq("id", 1);
  });

  it("computes data-driven TDEE and persists history (Req 11, 15)", async () => {
    // Neutralize profile so this asserts the data-driven path only.
    await client
      .from("user_profile")
      .update({ height_cm: null, date_of_birth: null, gender: null, activity_pal: null })
      .eq("id", 1);

    const res = await runRecompute(client, TODAY);
    expect(res.tdeeSource).toBe("data-driven");
    // stable weight + 2500 kcal/day => TDEE ~ 2500
    expect(res.currentTdee!).toBeCloseTo(2500, 0);

    const { data } = await client
      .from("tdee_records")
      .select("value, valid_days")
      .eq("window_end", TODAY);
    expect(data).toHaveLength(1);
    expect(data![0]!.value).toBeCloseTo(2500, 0);
    expect(data![0]!.valid_days).toBe(12);

    // current_target snapshot persisted (maintenance, no goal) at/above the floor
    const { data: ct } = await client
      .from("current_target")
      .select("calorie_target, tdee_source")
      .eq("id", 1);
    expect(ct![0]!.tdee_source).toBe("data-driven");
    expect(ct![0]!.calorie_target).toBeGreaterThanOrEqual(1200);
  });

  it("is idempotent — rerun yields identical records (Property 2)", async () => {
    const q = () =>
      client
        .from("tdee_records")
        .select("window_end, value, valid_days")
        .gte("window_end", "2021-01-01")
        .lte("window_end", "2021-02-01")
        .order("window_end");

    const first = (await q()).data;
    await runRecompute(client, TODAY);
    const second = (await q()).data;
    expect(second).toEqual(first);
  });

  it("falls back to estimated TDEE when no calorie data but profile+weight exist (Req 14, Property 5)", async () => {
    await client.from("calorie_entries").delete().gte("entry_date", "2021-01-01").lte("entry_date", "2021-02-01");
    await client
      .from("user_profile")
      .update({ height_cm: 180, date_of_birth: "1990-01-01", gender: "male", activity_pal: 1.55 })
      .eq("id", 1);

    const res = await runRecompute(client, TODAY);
    expect(res.tdeeSource).toBe("estimated");
    expect(res.currentTdee!).toBeGreaterThan(0);
  });
});
