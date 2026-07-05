// Create the single owner account for the webapp (Task 8).
// Runs locally using the service_role key from .env (admin API), so your password
// never goes through anything but your own machine + Supabase.
//
// Usage:
//   node scripts/create-user.mjs you@example.com "your-strong-password"
//
// The user is created pre-confirmed (no email verification step needed).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const here = dirname(fileURLToPath(import.meta.url));

// Minimal .env loader (avoids a dependency for this one-off script).
function loadEnv() {
  const env = {};
  try {
    const raw = readFileSync(resolve(here, "../.env"), "utf8");
    for (const line of raw.split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m) env[m[1]] = m[2];
    }
  } catch {
    /* .env optional if vars are already in process.env */
  }
  return { ...env, ...process.env };
}

const [, , email, password] = process.argv;
if (!email || !password) {
  console.error('Usage: node scripts/create-user.mjs <email> "<password>"');
  process.exit(1);
}

const env = loadEnv();
const url = env.SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const { data, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});

if (error) {
  console.error("Failed to create user:", error.message);
  process.exit(1);
}
console.log(`Created login for ${data.user?.email}. You can now sign in to the webapp.`);
