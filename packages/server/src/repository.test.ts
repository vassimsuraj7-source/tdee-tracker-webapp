import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServiceClient } from "./db.js";
import { loadWeights, loadCalories, getSyncTimestamp } from "./repository.js";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY && !!process.env.SUPABASE_URL;
const suite = canRun ? describe : describe.skip;

suite("repository (live DB integration)", () => {
  const client = createServiceClient();
  // Disjoint from the recompute test's January range to avoid any shared-DB overlap.
  const dates = ["2021-03-01", "2021-03-02", "2021-03-03"];

  async function cleanup() {
    await client.from("weight_entries").delete().in("entry_date", dates);
    await client.from("calorie_entries").delete().in("entry_date", dates);
  }

  beforeAll(cleanup);
  afterAll(cleanup);

  it("round-trips weight and calorie entries into engine shape", async () => {
    await client
      .from("weight_entries")
      .upsert(dates.map((d, i) => ({ entry_date: d, value_kg: 80 + i })), { onConflict: "entry_date" });
    await client
      .from("calorie_entries")
      .upsert(dates.map((d) => ({ entry_date: d, calories: 2000 })), { onConflict: "entry_date" });

    const weights = await loadWeights(client);
    const mine = weights.filter((w) => dates.includes(w.date));
    expect(mine.map((w) => w.value)).toEqual([80, 81, 82]);

    const calories = await loadCalories(client);
    expect(calories.filter((c) => dates.includes(c.date))).toHaveLength(3);
  });

  it("upsert is idempotent — one row per day (Req 3)", async () => {
    const row = [{ entry_date: "2021-03-01", value_kg: 99 }];
    await client.from("weight_entries").upsert(row, { onConflict: "entry_date" });
    await client.from("weight_entries").upsert(row, { onConflict: "entry_date" });
    const { data } = await client.from("weight_entries").select("value_kg").eq("entry_date", "2021-03-01");
    expect(data).toHaveLength(1);
    expect(data![0]!.value_kg).toBe(99);
  });

  it("reads the sync timestamp singleton", async () => {
    // Just assert it is reachable (null or a timestamp string).
    const ts = await getSyncTimestamp(client);
    expect(ts === null || typeof ts === "string").toBe(true);
  });
});
