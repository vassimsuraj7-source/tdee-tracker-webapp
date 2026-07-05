// Seed ~35 days of realistic dummy data so the dashboard can be visualised, then
// trigger the deployed recompute. Uses the service role from .env.
//
//   node scripts/seed-dummy.mjs          # seed + recompute
//   node scripts/seed-dummy.mjs --clear  # delete the seeded date range
//
// Profile: weight ~85 -> ~82 kg (a healthy deficit), calories 2000-2500,
// body fat 20% -> 18%, steps 6k-12k. Dates end today, going back 35 days.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const here = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(resolve(here, "../.env"), "utf8");
const get = (k) => (new RegExp(`^${k}=(.*)$`, "m").exec(raw) ?? [])[1]?.trim();

const url = get("SUPABASE_URL");
const serviceKey = get("SUPABASE_SERVICE_ROLE_KEY");
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

const DAYS = 35;
function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
const dates = Array.from({ length: DAYS }, (_, i) => isoDaysAgo(DAYS - 1 - i)); // oldest -> newest
const first = dates[0];
const last = dates[dates.length - 1];

const clear = process.argv.includes("--clear");
const inRange = (q) => q.gte("entry_date", first).lte("entry_date", last);

if (clear) {
  for (const t of ["weight_entries", "calorie_entries", "step_entries", "body_fat_entries"]) {
    const { error } = await inRange(db.from(t).delete());
    console.log(`${t}: ${error ? "ERROR " + error.message : "cleared " + first + ".." + last}`);
  }
  await db.from("tdee_records").delete().gte("window_end", first).lte("window_end", last);
  console.log("Cleared dummy data.");
  process.exit(0);
}

const rand = (min, max) => min + Math.random() * (max - min);

const weightRows = [];
const calorieRows = [];
const stepRows = [];
const bodyFatRows = [];

dates.forEach((date, i) => {
  const t = i / (DAYS - 1); // 0..1
  const weight = 85 - 3 * t + rand(-0.3, 0.3); // 85 -> 82 with daily noise
  const bodyFat = 0.2 - 0.02 * t + rand(-0.003, 0.003); // 20% -> 18%
  weightRows.push({ entry_date: date, value_kg: Math.round(weight * 10) / 10 });
  calorieRows.push({
    entry_date: date,
    calories: Math.round(rand(2000, 2500)),
    protein_g: Math.round(rand(120, 180)),
    carbs_g: Math.round(rand(150, 250)),
    fat_g: Math.round(rand(50, 90)),
    fiber_g: Math.round(rand(20, 40)),
  });
  stepRows.push({ entry_date: date, steps: Math.round(rand(6000, 12000)) });
  bodyFatRows.push({ entry_date: date, value_fraction: Math.round(bodyFat * 1000) / 1000 });
});

async function up(table, rows) {
  const { error } = await db.from(table).upsert(rows, { onConflict: "entry_date" });
  console.log(`${table}: ${error ? "ERROR " + error.message : rows.length + " rows"}`);
}

console.log(`Seeding ${first} .. ${last} (${DAYS} days)...`);
await up("weight_entries", weightRows);
await up("calorie_entries", calorieRows);
await up("step_entries", stepRows);
await up("body_fat_entries", bodyFatRows);
await db.from("sync_state").update({ last_sync_at: new Date().toISOString() }).eq("id", 1);

console.log("\nTriggering recompute...");
const res = await fetch(`${url}/functions/v1/recompute`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
  body: "{}",
});
console.log("recompute:", res.status, await res.text());
console.log("\nDone. Refresh the app to see the dashboard populated.");
