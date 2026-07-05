import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServiceClient } from "./db.js";
import { getProfile, updateProfile, deriveAge, requireProfileForCalc } from "./profile.js";
import { MissingProfileFieldError } from "./errors.js";
import { ACTIVITY_PAL } from "@tdee/engine";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY && !!process.env.SUPABASE_URL;
const suite = canRun ? describe : describe.skip;

describe("deriveAge (pure)", () => {
  it("computes calendar-correct age", () => {
    expect(deriveAge("1990-06-15", "2021-06-15")).toBe(31); // birthday today
    expect(deriveAge("1990-06-15", "2021-06-14")).toBe(30); // day before birthday
    expect(deriveAge("1990-06-15", "2021-12-31")).toBe(31);
  });
});

suite("profile service (live DB)", () => {
  const client = createServiceClient();
  let original: Record<string, unknown> | undefined;

  beforeAll(async () => {
    const { data } = await client.from("user_profile").select("*").eq("id", 1);
    original = data?.[0] as Record<string, unknown> | undefined;
  });

  afterAll(async () => {
    if (original) await client.from("user_profile").update(original).eq("id", 1);
  });

  it("updates fields and derives age (Req 7.1, 7.2)", async () => {
    await updateProfile(client, {
      name: "Test",
      dateOfBirth: "1990-01-01",
      heightCm: 180,
      gender: "male",
      activityPal: 1.725,
      calorieGoal: null,
    });
    const p = await getProfile(client, "2021-06-15");
    expect(p.name).toBe("Test");
    expect(p.heightCm).toBe(180);
    expect(p.gender).toBe("male");
    expect(p.activityPal).toBe(1.725);
    expect(p.age).toBe(31);
  });

  it("defaults activity level to moderate when unset (Req 7.3)", async () => {
    await updateProfile(client, { activityPal: null });
    const p = await getProfile(client, "2021-06-15");
    expect(p.activityPal).toBe(ACTIVITY_PAL.moderate);
  });

  it("flags the missing field required for a calculation (Req 7.4)", async () => {
    await updateProfile(client, { dateOfBirth: "1990-01-01", heightCm: 180, gender: null });
    const p = await getProfile(client, "2021-06-15");
    expect(() => requireProfileForCalc(p)).toThrowError(MissingProfileFieldError);
    try {
      requireProfileForCalc(p);
    } catch (e) {
      expect((e as MissingProfileFieldError).field).toBe("gender");
    }
  });
});
