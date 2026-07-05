// End-to-end test of the deployed ingest function (Task 4 verification).
// Usage:  node scripts/test-ingest.mjs <YOUR_INGEST_API_KEY>
// Posts sample payloads to the live function and prints the responses. Uses 2021
// test dates that won't collide with real data; a follow-up cleanup removes them.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
function envValue(key) {
  try {
    const raw = readFileSync(resolve(here, "../.env"), "utf8");
    const m = new RegExp(`^${key}=(.*)$`, "m").exec(raw);
    return m ? m[1].trim() : undefined;
  } catch {
    return undefined;
  }
}

const apiKey = process.argv[2] || process.env.INGEST_API_KEY;
if (!apiKey) {
  console.error('Usage: node scripts/test-ingest.mjs "<YOUR_INGEST_API_KEY>"');
  process.exit(1);
}
const base = envValue("SUPABASE_URL");
const url = `${base}/functions/v1/ingest`;

async function post(label, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`\n== ${label} ==`);
  console.log("status", res.status);
  console.log(text);
}

const validPayload = {
  entries: [
    { date: "2021-02-01", weightKg: 80.0, nutrition: { calories: 2400, protein: 150 } },
    { date: "2021-02-02", weightKg: 79.8, steps: 8200, nutrition: { calories: 2350 } },
  ],
};

const mixedPayload = {
  entries: [
    { date: "2021-02-03", weightKg: 79.6 }, // valid
    { weightKg: 70 }, // invalid: missing date
    { date: "2021-02-04", weightKg: -5 }, // invalid: negative
  ],
};

await post("First POST (should store 2 dates)", validPayload);
await post("Second POST identical (idempotent — still 2 dates, no duplicates)", validPayload);
await post("Mixed valid/invalid (stores 2021-02-03, rejects the other two)", mixedPayload);
console.log("\nDone. Tell the agent to run the verify + cleanup step.");
