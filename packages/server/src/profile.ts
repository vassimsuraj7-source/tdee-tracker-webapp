import { ACTIVITY_PAL, type Gender } from "@tdee/engine";
import type { SupabaseClient } from "./db.js";
import { MissingProfileFieldError, ValidationError } from "./errors.js";

export interface ProfileInput {
  name?: string | null;
  dateOfBirth?: string | null; // ISO date
  heightCm?: number | null;
  gender?: Gender | null;
  activityPal?: number | null;
  calorieGoal?: number | null;
}

export interface Profile {
  name: string | null;
  dateOfBirth: string | null;
  heightCm: number | null;
  gender: Gender | null;
  activityPal: number; // defaulted to moderate when unset (Req 7.3)
  calorieGoal: number | null;
  age: number | null; // derived from dateOfBirth (Req 7.2)
}

/** Calendar-correct age in whole years between an ISO date of birth and `today`. */
export function deriveAge(dateOfBirth: string, today: string): number {
  const [dy, dm, dd] = dateOfBirth.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = today.split("-").map(Number) as [number, number, number];
  let age = ty - dy;
  if (tm < dm || (tm === dm && td < dd)) age--;
  return age;
}

/** Load the singleton profile with derived age and defaulted activity level (Req 7.2, 7.3, 7.5). */
export async function getProfile(client: SupabaseClient, today: string): Promise<Profile> {
  const { data, error } = await client
    .from("user_profile")
    .select("name, date_of_birth, height_cm, gender, activity_pal, calorie_goal")
    .eq("id", 1)
    .limit(1);
  if (error) throw new Error(error.message);
  const row = data?.[0] as
    | {
        name: string | null;
        date_of_birth: string | null;
        height_cm: number | null;
        gender: Gender | null;
        activity_pal: number | null;
        calorie_goal: number | null;
      }
    | undefined;

  return {
    name: row?.name ?? null,
    dateOfBirth: row?.date_of_birth ?? null,
    heightCm: row?.height_cm ?? null,
    gender: row?.gender ?? null,
    activityPal: row?.activity_pal ?? ACTIVITY_PAL.moderate,
    calorieGoal: row?.calorie_goal ?? null,
    age: row?.date_of_birth ? deriveAge(row.date_of_birth, today) : null,
  };
}

/** Update the singleton profile (Req 7.1). Only provided fields are changed. */
export async function updateProfile(client: SupabaseClient, input: ProfileInput): Promise<void> {
  if (input.heightCm != null && (!Number.isFinite(input.heightCm) || input.heightCm <= 0)) {
    throw new ValidationError("height must be a positive number");
  }
  if (input.activityPal != null && (!Number.isFinite(input.activityPal) || input.activityPal <= 0)) {
    throw new ValidationError("activity level must be a positive number");
  }

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.dateOfBirth !== undefined) patch.date_of_birth = input.dateOfBirth;
  if (input.heightCm !== undefined) patch.height_cm = input.heightCm;
  if (input.gender !== undefined) patch.gender = input.gender;
  if (input.activityPal !== undefined) patch.activity_pal = input.activityPal;
  if (input.calorieGoal !== undefined) patch.calorie_goal = input.calorieGoal;

  const { error } = await client.from("user_profile").update(patch).eq("id", 1);
  if (error) throw new Error(error.message);
}

/**
 * Assert the profile has the fields required for a downstream calculation
 * (BMR/estimated TDEE, guardrails). Throws MissingProfileFieldError naming the
 * missing field (Req 7.4).
 */
export function requireProfileForCalc(profile: Profile): void {
  if (!profile.dateOfBirth) throw new MissingProfileFieldError("dateOfBirth");
  if (profile.heightCm == null) throw new MissingProfileFieldError("heightCm");
  if (!profile.gender) throw new MissingProfileFieldError("gender");
}
