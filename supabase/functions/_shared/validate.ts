// Pure Health_Payload validation (Req 4). No Deno/DB APIs, so it is portable and
// testable in isolation. Rejects invalid entries per-entry while allowing valid
// ones in the same payload to proceed (partial accept, Req 4.4).

export interface Nutrition {
  calories: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
}

export interface ValidEntry {
  date: string;
  weightKg?: number;
  bodyFat?: number;
  steps?: number;
  nutrition?: Nutrition;
}

export interface Rejection {
  index: number;
  field: string;
  reason: string;
}

export interface ValidationResult {
  valid: ValidEntry[];
  rejections: Rejection[];
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** True when a value means "not provided" (Shortcuts sends these for missing metrics). */
function isBlank(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}

/**
 * Coerce a possibly-stringified numeric value (Shortcuts serializes numbers as
 * strings) to a non-negative number.
 * Returns null when blank (skip the field), or "invalid" when present but not a
 * valid non-negative number.
 */
function coerceNonNegative(v: unknown): number | null | "invalid" {
  if (isBlank(v)) return null;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.trim()) : NaN;
  if (!Number.isFinite(n) || n < 0) return "invalid";
  return n;
}

function daysBetweenUtc(aIso: string, bIso: string): number {
  const a = Date.parse(`${aIso}T00:00:00Z`);
  const b = Date.parse(`${bIso}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/**
 * Validate a raw request body of shape `{ entries: RawEntry[] }` against `todayIso`
 * (the server's current calendar day, "YYYY-MM-DD"). Returns the accepted entries
 * and a list of per-entry rejections.
 */
export function validatePayload(body: unknown, todayIso: string): ValidationResult {
  const valid: ValidEntry[] = [];
  const rejections: Rejection[] = [];

  if (!isRecord(body) || !Array.isArray(body.entries)) {
    return { valid, rejections: [{ index: -1, field: "entries", reason: "missing entries array" }] };
  }

  body.entries.forEach((raw, index) => {
    if (!isRecord(raw)) {
      rejections.push({ index, field: "entry", reason: "not an object" });
      return;
    }

    // date: required, ISO, not more than 1 day in the future (Req 4.1, 4.3)
    const date = raw.date;
    if (typeof date !== "string" || !ISO_DATE_RE.test(date)) {
      rejections.push({ index, field: "date", reason: "missing or not YYYY-MM-DD" });
      return;
    }
    if (daysBetweenUtc(todayIso, date) > 1) {
      rejections.push({ index, field: "date", reason: "more than 1 day in the future" });
      return;
    }

    const entry: ValidEntry = { date };

    // Optional numeric metrics. Blank values are skipped (a missed weigh-in must not
    // reject the whole entry); present-but-invalid values reject the entry (Req 4.2).
    const weight = coerceNonNegative(raw.weightKg);
    if (weight === "invalid") {
      rejections.push({ index, field: "weightKg", reason: "not a non-negative number" });
      return;
    }
    if (weight !== null) entry.weightKg = weight;

    // Body fat: accept a fraction (0-1) or a percentage (1-100, normalized to /100).
    const bf = coerceNonNegative(raw.bodyFat);
    if (bf === "invalid" || (typeof bf === "number" && bf > 100)) {
      rejections.push({ index, field: "bodyFat", reason: "must be a fraction (0-1) or percent (0-100)" });
      return;
    }
    if (bf !== null) entry.bodyFat = bf > 1 ? bf / 100 : bf;

    const steps = coerceNonNegative(raw.steps);
    if (steps === "invalid") {
      rejections.push({ index, field: "steps", reason: "not a non-negative number" });
      return;
    }
    if (steps !== null) entry.steps = steps;

    if (!isBlank(raw.nutrition)) {
      const n = raw.nutrition;
      if (!isRecord(n)) {
        rejections.push({ index, field: "nutrition", reason: "must be an object" });
        return;
      }
      const calories = coerceNonNegative(n.calories);
      if (calories === "invalid") {
        rejections.push({ index, field: "nutrition.calories", reason: "not a non-negative number" });
        return;
      }
      // Only record nutrition when calories are actually present.
      if (calories !== null) {
        const nutrition: Nutrition = { calories };
        for (const macro of ["protein", "carbs", "fat", "fiber"] as (keyof Nutrition)[]) {
          const value = coerceNonNegative(n[macro]);
          if (value === "invalid") {
            rejections.push({ index, field: `nutrition.${macro}`, reason: "not a non-negative number" });
            return;
          }
          if (value !== null) nutrition[macro] = value;
        }
        entry.nutrition = nutrition;
      }
    }

    valid.push(entry);
  });

  return { valid, rejections };
}
