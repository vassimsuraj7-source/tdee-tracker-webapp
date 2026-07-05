// Ingestion API Edge Function (Task 4).
// Receives a Health_Payload from the export bridge, authenticates it with a salted
// API-key hash, validates it, and upserts each metric idempotently (Req 1-4).
//
// Deploy: `supabase functions deploy ingest --no-verify-jwt`
//   (--no-verify-jwt because this endpoint authenticates via its own API key, not a
//    Supabase user JWT — the bridge is an automation, not a logged-in user.)
// Secrets required (set once): INGEST_API_KEY_SALT, INGEST_API_KEY_HASH.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically by Supabase.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validatePayload, type ValidEntry } from "../_shared/validate.ts";
import { verifyApiKey } from "../_shared/auth.ts";

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function todayUtcIso(): string {
  return new Date().toISOString().slice(0, 10);
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // --- Authentication (Req 1) ---
  const providedKey = req.headers.get("x-api-key");
  const salt = Deno.env.get("INGEST_API_KEY_SALT") ?? "";
  const expectedHash = Deno.env.get("INGEST_API_KEY_HASH") ?? "";
  const authorized = await verifyApiKey(providedKey, salt, expectedHash);
  if (!authorized) {
    // Access log for rejected attempts (Req 1.4). No secret is echoed (Req 22.6).
    console.warn(
      JSON.stringify({
        event: "ingest_auth_reject",
        ts: new Date().toISOString(),
        ip: req.headers.get("x-forwarded-for") ?? "unknown",
      }),
    );
    return json({ error: "Unauthorized" }, 401);
  }

  // --- Parse + validate (Req 4) ---
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const { valid, rejections } = validatePayload(body, todayUtcIso());

  // --- Persist (Req 2, 3): each date processed independently, upsert by entry_date ---
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const affected = new Set<string>();
  const writeErrors: { date: string; field: string; reason: string }[] = [];

  const upsert = async (
    table: string,
    row: Record<string, unknown>,
    field: string,
    date: string,
  ): Promise<void> => {
    const { error } = await supabase.from(table).upsert(row, { onConflict: "entry_date" });
    if (error) {
      writeErrors.push({ date, field, reason: error.message });
    } else {
      affected.add(date);
    }
  };

  for (const e of valid as ValidEntry[]) {
    if (e.weightKg !== undefined) {
      await upsert("weight_entries", { entry_date: e.date, value_kg: e.weightKg }, "weight", e.date);
    }
    if (e.bodyFat !== undefined) {
      await upsert(
        "body_fat_entries",
        { entry_date: e.date, value_fraction: e.bodyFat },
        "bodyFat",
        e.date,
      );
    }
    if (e.steps !== undefined) {
      await upsert("step_entries", { entry_date: e.date, steps: e.steps }, "steps", e.date);
    }
    if (e.nutrition !== undefined) {
      await upsert(
        "calorie_entries",
        {
          entry_date: e.date,
          calories: e.nutrition.calories,
          protein_g: e.nutrition.protein ?? null,
          carbs_g: e.nutrition.carbs ?? null,
          fat_g: e.nutrition.fat ?? null,
          fiber_g: e.nutrition.fiber ?? null,
        },
        "nutrition",
        e.date,
      );
    }
  }

  // --- Sync timestamp (Req 2.6) ---
  await supabase.from("sync_state").update({ last_sync_at: new Date().toISOString() }).eq("id", 1);

  // If everything valid failed to write or the payload was entirely invalid, signal 400.
  const nothingStored = affected.size === 0;
  const status = nothingStored && (rejections.length > 0 || writeErrors.length > 0) ? 400 : 200;

  return json(
    {
      affected: [...affected],
      rejections,
      writeErrors,
      syncedAt: new Date().toISOString(),
    },
    status,
  );
});
