// Reset all data and seed 16 weeks (112 days) across four diet phases so every
// feature can be tested: Recomp -> Bulk -> Maintain -> Cut, 4 weeks each, ending
// today (Cut is the current, ongoing phase). Uses the service role from .env.
//
//   node scripts/seed-dummy.mjs          # full reset + seed + phases + goal + recompute
//   node scripts/seed-dummy.mjs --clear  # full reset only (no seeding)
//
// Weight & calorie trajectories are internally consistent so the derived TDEE stays
// ~2600 across phases (TDEE ≈ intake − weeklyKg×1100/day):
//   Recomp  −0.15 kg/wk, ~2435 kcal   Bulk +0.30 kg/wk, ~2930 kcal
//   Maintain 0 kg/wk,     ~2600 kcal   Cut  −0.50 kg/wk, ~2050 kcal

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

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
const rand = (min, max) => min + Math.random() * (max - min);
const r1 = (x) => Math.round(x * 10) / 10;

// ---- Full reset (test data only; schema untouched) ----
async function wipe() {
  const jobs = [
    db.from("weight_entries").delete().gte("entry_date", "1900-01-01"),
    db.from("calorie_entries").delete().gte("entry_date", "1900-01-01"),
    db.from("step_entries").delete().gte("entry_date", "1900-01-01"),
    db.from("body_fat_entries").delete().gte("entry_date", "1900-01-01"),
    db.from("tdee_records").delete().gte("window_end", "1900-01-01"),
    db.from("diet_phases").delete().not("id", "is", null),
    db.from("user_goals").delete().not("id", "is", null),
  ];
  for (const j of jobs) {
    const { error } = await j;
    if (error) console.log("wipe error:", error.message);
  }
  console.log("Wiped all entries, phases, goals, and TDEE records.");
}

await wipe();
if (process.argv.includes("--clear")) {
  await db.from("current_target").update({
    calorie_target: null, tdee_used: null, tdee_source: "undetermined",
    rate_capped: false, date_unachievable: false, warning: null,
  }).eq("id", 1);
  console.log("Cleared. (no seeding)");
  process.exit(0);
}

// ---- Phase plan (oldest -> newest) ----
const PHASES = [
  { type: "recomp", weeks: 4, weeklyKg: -0.15, kcal: 2435, bfWk: -0.0012 },
  { type: "bulk", weeks: 4, weeklyKg: 0.30, kcal: 2930, bfWk: 0.0015 },
  { type: "maintain", weeks: 4, weeklyKg: 0.0, kcal: 2600, bfWk: 0.0 },
  { type: "cut", weeks: 4, weeklyKg: -0.5, kcal: 2050, bfWk: -0.003 },
];
const TOTAL_DAYS = PHASES.reduce((s, p) => s + p.weeks * 7, 0); // 112
const dates = Array.from({ length: TOTAL_DAYS }, (_, i) => isoDaysAgo(TOTAL_DAYS - 1 - i));

// Assign each day to a phase and record phase date ranges.
const dayPhase = [];
const phaseRanges = [];
let cursor = 0;
for (const p of PHASES) {
  const len = p.weeks * 7;
  phaseRanges.push({ type: p.type, startIdx: cursor, endIdx: cursor + len - 1 });
  for (let k = 0; k < len; k++) dayPhase.push(p);
  cursor += len;
}

// ---- Generate daily rows ----
let weight = 82.0;
let bf = 0.18;
const weightRows = [];
const calorieRows = [];
const stepRows = [];
const bodyFatRows = [];

dates.forEach((date, i) => {
  const p = dayPhase[i];
  weight += p.weeklyKg / 7;
  bf += p.bfWk / 7;
  const kcal = Math.round(p.kcal + rand(-150, 150));
  const protein = Math.round(rand(150, 185));
  const fat = Math.round(rand(60, 90));
  const proteinKcal = protein * 4;
  const fatKcal = fat * 9;
  const carbs = Math.max(0, Math.round((kcal - proteinKcal - fatKcal) / 4));
  weightRows.push({ entry_date: date, value_kg: r1(weight + rand(-0.4, 0.4)) });
  bodyFatRows.push({ entry_date: date, value_fraction: Math.round(Math.max(0.05, bf) * 1000) / 1000 });
  calorieRows.push({ entry_date: date, calories: kcal, protein_g: protein, carbs_g: carbs, fat_g: fat, fiber_g: Math.round(rand(24, 40)) });
  stepRows.push({ entry_date: date, steps: Math.round(rand(6000, 11000)) });
});

async function up(table, rows) {
  const { error } = await db.from(table).upsert(rows, { onConflict: "entry_date" });
  console.log(`${table}: ${error ? "ERROR " + error.message : rows.length + " rows"}`);
}

console.log(`Seeding ${dates[0]} .. ${dates[dates.length - 1]} (${TOTAL_DAYS} days, 4 phases)...`);
await up("weight_entries", weightRows);
await up("calorie_entries", calorieRows);
await up("step_entries", stepRows);
await up("body_fat_entries", bodyFatRows);

// ---- Phases (last one ongoing) ----
const phaseRows = phaseRanges.map((r, idx) => ({
  phase_type: r.type,
  start_date: dates[r.startIdx],
  end_date: idx === phaseRanges.length - 1 ? null : dates[r.endIdx],
  note: `${r.type} block (seed)`,
}));
const { error: phErr } = await db.from("diet_phases").insert(phaseRows);
console.log(`diet_phases: ${phErr ? "ERROR " + phErr.message : phaseRows.length + " phases"}`);

// ---- A weight goal so projection/progress can be tested (current phase is Cut) ----
const goalDate = isoDaysAgo(-56); // ~8 weeks out
const { error: goalErr } = await db.from("user_goals").insert({
  goal_type: "weight",
  order_index: -1,
  target_value: 79,
  goal_date: goalDate,
  current_value_at_set: r1(weightRows[0].value_kg),
});
console.log(`user_goals: ${goalErr ? "ERROR " + goalErr.message : "weight goal 79 kg by " + goalDate}`);

await db.from("sync_state").update({ last_sync_at: new Date().toISOString() }).eq("id", 1);

console.log("\nTriggering recompute...");
const res = await fetch(`${url}/functions/v1/recompute`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
  body: "{}",
});
console.log("recompute:", res.status, await res.text());
console.log("\nDone. Refresh the app.");
