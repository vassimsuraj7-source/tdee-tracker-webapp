import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServiceClient } from "./db.js";
import { saveEntry, deleteEntry, listEntries } from "./entries.js";
import { ValidationError } from "./errors.js";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY && !!process.env.SUPABASE_URL;
const suite = canRun ? describe : describe.skip;

suite("entries service (live DB)", () => {
  const client = createServiceClient();
  const today = "2021-05-07";

  async function cleanup() {
    await client.from("weight_entries").delete().gte("entry_date", "2021-05-01").lte("entry_date", "2021-05-31");
    await client.from("calorie_entries").delete().gte("entry_date", "2021-05-01").lte("entry_date", "2021-05-31");
    await client.from("body_fat_entries").delete().gte("entry_date", "2021-05-01").lte("entry_date", "2021-05-31");
  }
  beforeAll(cleanup);
  afterAll(cleanup);

  it("saves and lists single-value entries within a range", async () => {
    await saveEntry(client, "weight", { date: "2021-05-01", value: 80 });
    await saveEntry(client, "weight", { date: "2021-05-02", value: 81 });
    const all = await listEntries(client, "weight", "all", today);
    const mine = all.filter((e) => e.date.startsWith("2021-05"));
    expect(mine.map((e) => e.value)).toEqual([80, 81]);
  });

  it("saves and lists calorie entries with macros", async () => {
    await saveEntry(client, "calories", {
      date: "2021-05-03",
      value: 2100,
      macros: { protein: 150, carbs: 190, fat: 70, fiber: 30 },
    });
    const list = await listEntries(client, "calories", "all", today);
    const row = list.find((e) => e.date === "2021-05-03");
    expect(row?.value).toBe(2100);
    expect(row?.macros?.protein).toBe(150);
  });

  it("editing the value at the same date preserves the date (Req 6.2)", async () => {
    await saveEntry(client, "weight", { date: "2021-05-01", value: 79.5 });
    const all = await listEntries(client, "weight", "all", today);
    const row = all.find((e) => e.date === "2021-05-01");
    expect(row?.value).toBe(79.5);
  });

  it("rejects negative / out-of-range values before writing (Req 6.4)", async () => {
    await expect(saveEntry(client, "weight", { date: "2021-05-04", value: -1 })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      saveEntry(client, "bodyfat", { date: "2021-05-04", value: 1.5 }),
    ).rejects.toBeInstanceOf(ValidationError);
    // nothing written for the rejected date
    const all = await listEntries(client, "weight", "all", today);
    expect(all.find((e) => e.date === "2021-05-04")).toBeUndefined();
  });

  it("deletes an entry (Req 6.3)", async () => {
    await saveEntry(client, "steps", { date: "2021-05-05", value: 9000 });
    await deleteEntry(client, "steps", "2021-05-05");
    const all = await listEntries(client, "steps", "all", today);
    expect(all.find((e) => e.date === "2021-05-05")).toBeUndefined();
  });

  it("filters by time range", async () => {
    // 05-01 is within 7d of today 05-07; add an old entry outside the window
    await saveEntry(client, "weight", { date: "2021-04-01", value: 85 });
    const sevenDay = await listEntries(client, "weight", "7d", today);
    expect(sevenDay.find((e) => e.date === "2021-04-01")).toBeUndefined();
    // cleanup the stray April row
    await deleteEntry(client, "weight", "2021-04-01");
  });
});
