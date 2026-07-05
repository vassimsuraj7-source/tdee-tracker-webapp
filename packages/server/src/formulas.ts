import { compareTdeeFormulas, type FormulaEstimate } from "@tdee/engine";
import type { SupabaseClient } from "./db.js";
import { getProfile } from "./profile.js";

export interface FormulaComparison {
  /** Each literature formula's BMR + estimated TDEE. */
  estimates: FormulaEstimate[];
  /** The app's data-driven TDEE (the ground truth for this person). */
  dataDriven: { value: number | null; source: string | null };
  /** Activity PAL used for the estimates. */
  activityPal: number;
  /** The inputs that fed the formulas (for display). */
  inputs: {
    weightKg: number | null;
    heightCm: number | null;
    ageYears: number | null;
    gender: string | null;
    bodyFatFraction: number | null;
  };
  /** Profile fields still missing (so the UI can prompt). Empty when complete. */
  missing: string[];
}

/** Assemble the formula comparison from the latest profile, weight, and body fat. */
export async function getFormulaComparison(client: SupabaseClient, today: string): Promise<FormulaComparison> {
  const profile = await getProfile(client, today);

  const { data: wData, error: wErr } = await client
    .from("weight_entries")
    .select("value_kg")
    .order("entry_date", { ascending: false })
    .limit(1);
  if (wErr) throw new Error(wErr.message);
  const weightKg = (wData?.[0]?.value_kg as number | undefined) ?? null;

  const { data: bfData, error: bfErr } = await client
    .from("body_fat_entries")
    .select("value_fraction")
    .order("entry_date", { ascending: false })
    .limit(1);
  if (bfErr) throw new Error(bfErr.message);
  const bodyFatFraction = (bfData?.[0]?.value_fraction as number | undefined) ?? null;

  const { data: ctData, error: ctErr } = await client
    .from("current_target")
    .select("tdee_used, tdee_source")
    .eq("id", 1)
    .limit(1);
  if (ctErr) throw new Error(ctErr.message);
  const ct = ctData?.[0] as { tdee_used: number | null; tdee_source: string | null } | undefined;

  const missing: string[] = [];
  if (weightKg == null) missing.push("weight");
  if (profile.heightCm == null) missing.push("height");
  if (profile.age == null) missing.push("date of birth");
  if (!profile.gender) missing.push("gender");

  let estimates: FormulaEstimate[] = [];
  if (weightKg != null && profile.heightCm != null && profile.age != null && profile.gender) {
    estimates = compareTdeeFormulas({
      weightKg,
      heightCm: profile.heightCm,
      ageYears: profile.age,
      gender: profile.gender,
      activityPal: profile.activityPal,
      ...(bodyFatFraction != null ? { bodyFatFraction } : {}),
    });
  }

  return {
    estimates,
    dataDriven: { value: ct?.tdee_used ?? null, source: ct?.tdee_source ?? null },
    activityPal: profile.activityPal,
    inputs: { weightKg, heightCm: profile.heightCm, ageYears: profile.age, gender: profile.gender, bodyFatFraction },
    missing,
  };
}
