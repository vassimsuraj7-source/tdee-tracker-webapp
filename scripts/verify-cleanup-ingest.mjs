// Verify the ingest test rows landed exactly once (idempotency proof), then delete
// the 2021-02 test rows. Uses the service role from .env.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const here = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(resolve(here, "../.env"), "utf8");
const env = Object.fromEntries(
  raw.split("\n").map((l) => l.trim()).filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i), l.slice(i + 1)];
  }),
);
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const inRange = (q) => q.gte("entry_date", "2021-02-01").lte("entry_date", "2021-02-28");

for (const table of ["weight_entries", "calorie_entries", "step_entries", "body_fat_entries"]) {
  const { data, error } = await inRange(db.from(table).select("entry_date"));
  if (error) {
    console.error(table, "ERROR", error.message);
    continue;
  }
  console.log(`${table}: ${data.length} test row(s) -> [${data.map((r) => r.entry_date).join(", ")}]`);
}

console.log("\nCleaning up test rows...");
for (const table of ["weight_entries", "calorie_entries", "step_entries", "body_fat_entries"]) {
  const { error } = await inRange(db.from(table).delete());
  console.log(`${table}: ${error ? "ERROR " + error.message : "deleted"}`);
}

console.log("\nVerifying cleanup...");
for (const table of ["weight_entries", "calorie_entries", "step_entries", "body_fat_entries"]) {
  const { data } = await inRange(db.from(table).select("entry_date"));
  console.log(`${table}: ${data?.length ?? "?"} remaining`);
}
