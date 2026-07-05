// Scheduled Daily Recompute Edge Function (Task 7, Req 5.4).
// Invoked by pg_cron (via pg_net) shortly before local midnight, and callable
// on-demand. Mirrors @tdee/server's runRecompute, but self-contained for Deno:
// it imports the PURE engine (no external deps, bundles cleanly) and does DB access
// with supabase-js from esm.sh.
//
// Deploy: `supabase functions deploy recompute` (JWT verification ON — pg_net sends
// the service_role key as the Bearer token, which the gateway validates).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  computeWindowTdees,
  computeTrendWeight,
  estimatedTdee,
  calorieTarget,
  ACTIVITY_PAL,
} from "../../../packages/engine/dist/index.js";

/** Calendar-correct age (mirrors @tdee/server deriveAge). */
function deriveAge(dob: string, today: string): number {
  const [dy, dm, dd] = dob.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let age = ty - dy;
  if (tm < dm || (tm === dm && td < dd)) age -= 1;
  return age;
}

function todayUtcIso(): string {
  return new Date().toISOString().slice(0, 10);
}

Deno.serve(async (): Promise<Response> => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const today = todayUtcIso();

  const [wRes, cRes, pRes, gRes, phRes] = await Promise.all([
    supabase.from("weight_entries").select("entry_date, value_kg").order("entry_date"),
    supabase.from("calorie_entries").select("entry_date, calories").order("entry_date"),
    supabase.from("user_profile").select("*").eq("id", 1).limit(1),
    supabase
      .from("user_goals")
      .select("target_value, goal_date")
      .eq("goal_type", "weight")
      .eq("order_index", -1)
      .eq("is_completed", false)
      .limit(1),
    supabase.from("diet_phases").select("phase_type").is("end_date", null).limit(1),
  ]);

  const weights = (wRes.data ?? []).map((r) => ({ date: r.entry_date, value: r.value_kg }));
  const calories = (cRes.data ?? []).map((r) => ({ date: r.entry_date, value: r.calories }));
  const profile = pRes.data?.[0];
  const goal = gRes.data?.[0];
  const currentPhase = phRes.data?.[0]?.phase_type ?? undefined;

  // 1) data-driven TDEE series + persist history
  const series = computeWindowTdees(weights, calories, today);
  if (series.history.length) {
    await supabase.from("tdee_records").upsert(
      series.history.map((h) => ({
        window_start: h.window.start,
        window_end: h.window.end,
        value: h.tdee,
        valid_days: h.validDays,
      })),
      { onConflict: "window_end" },
    );
  }

  // 2) current TDEE: data-driven preferred, else BMR estimate, else undetermined
  let currentTdee: number | undefined;
  let tdeeSource: "data-driven" | "estimated" | "undetermined";
  const latestWeight = weights.at(-1)?.value;
  if (series.current) {
    currentTdee = series.current.tdee;
    tdeeSource = "data-driven";
  } else if (profile?.height_cm && profile.date_of_birth && profile.gender && latestWeight != null) {
    currentTdee = estimatedTdee(
      {
        weightKg: latestWeight,
        heightCm: profile.height_cm,
        ageYears: deriveAge(profile.date_of_birth, today),
        gender: profile.gender,
      },
      profile.activity_pal ?? ACTIVITY_PAL.moderate,
    );
    tdeeSource = "estimated";
  } else {
    currentTdee = undefined;
    tdeeSource = "undetermined";
  }

  // 3) calorie target with guardrails
  const trend = computeTrendWeight(weights, today);
  const canUseGoal = goal && goal.goal_date && profile?.height_cm;
  const target = calorieTarget({
    currentTdee,
    tdeeSource,
    currentTrendWeightKg: trend,
    heightCm: profile?.height_cm ?? 0,
    ...(canUseGoal
      ? { goal: { targetWeightKg: goal.target_value, targetDate: goal.goal_date } }
      : {}),
    ...(currentPhase ? { phase: currentPhase } : {}),
    today,
  });

  // 4) persist the current-target snapshot
  await supabase
    .from("current_target")
    .update({
      calorie_target: target.calorieTarget ?? null,
      tdee_used: target.tdeeUsed ?? null,
      tdee_source: target.tdeeSource,
      rate_capped: target.rateCapped,
      date_unachievable: target.dateUnachievable,
      warning: target.warning ?? null,
      computed_at: new Date().toISOString(),
    })
    .eq("id", 1);

  return new Response(
    JSON.stringify({
      ok: true,
      today,
      tdeeSource,
      currentTdee: currentTdee ?? null,
      windows: series.history.length,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
