import type { SupabaseClient } from "./db.js";
import { ValidationError } from "./errors.js";
import { SINGLE_VALUE_METRICS, rangeStartIso, type Metric, type TimeRange } from "./metrics.js";

export interface Macros {
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
}

export interface EntryRecord {
  date: string;
  value: number;
  macros?: Macros;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertValidValue(metric: Metric, value: number): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new ValidationError(`${metric} value must be a non-negative number`);
  }
  if (metric === "bodyfat" && value > 1) {
    throw new ValidationError("body fat must be a fraction between 0 and 1");
  }
}

function assertValidDate(date: string): void {
  if (typeof date !== "string" || !ISO_DATE_RE.test(date)) {
    throw new ValidationError("date must be YYYY-MM-DD");
  }
}

function assertMacros(macros: Macros | undefined): void {
  if (!macros) return;
  for (const [k, v] of Object.entries(macros)) {
    if (v !== undefined && (typeof v !== "number" || !Number.isFinite(v) || v < 0)) {
      throw new ValidationError(`nutrition ${k} must be a non-negative number`);
    }
  }
}

/**
 * Create or update an entry for a metric on a date (Req 6.1, 6.2). Keyed by
 * entry_date, so editing the value at the same date preserves the date. Validation
 * rejects negative/non-numeric values before any write (Req 6.4).
 */
export async function saveEntry(
  client: SupabaseClient,
  metric: Metric,
  entry: EntryRecord,
): Promise<void> {
  assertValidDate(entry.date);
  assertValidValue(metric, entry.value);

  if (metric === "calories") {
    assertMacros(entry.macros);
    const { error } = await client.from("calorie_entries").upsert(
      {
        entry_date: entry.date,
        calories: entry.value,
        protein_g: entry.macros?.protein ?? null,
        carbs_g: entry.macros?.carbs ?? null,
        fat_g: entry.macros?.fat ?? null,
        fiber_g: entry.macros?.fiber ?? null,
      },
      { onConflict: "entry_date" },
    );
    if (error) throw new Error(error.message);
    return;
  }

  const { table, valueCol } = SINGLE_VALUE_METRICS[metric];
  const { error } = await client
    .from(table)
    .upsert({ entry_date: entry.date, [valueCol]: entry.value }, { onConflict: "entry_date" });
  if (error) throw new Error(error.message);
}

/**
 * Move an entry to a different date (explicit date change, Req 6.2): deletes the old
 * date and writes the new one atomically enough for a single-user app.
 */
export async function moveEntry(
  client: SupabaseClient,
  metric: Metric,
  fromDate: string,
  entry: EntryRecord,
): Promise<void> {
  if (fromDate !== entry.date) {
    await deleteEntry(client, metric, fromDate);
  }
  await saveEntry(client, metric, entry);
}

/** Delete an entry for a metric on a date (Req 6.3). */
export async function deleteEntry(
  client: SupabaseClient,
  metric: Metric,
  date: string,
): Promise<void> {
  assertValidDate(date);
  const table = metric === "calories" ? "calorie_entries" : SINGLE_VALUE_METRICS[metric].table;
  const { error } = await client.from(table).delete().eq("entry_date", date);
  if (error) throw new Error(error.message);
}

/** List entries for a metric within a time range, ascending by date (Req 18.5). */
export async function listEntries(
  client: SupabaseClient,
  metric: Metric,
  range: TimeRange,
  today: string,
): Promise<EntryRecord[]> {
  const start = rangeStartIso(range, today);

  if (metric === "calories") {
    let q = client
      .from("calorie_entries")
      .select("entry_date, calories, protein_g, carbs_g, fat_g, fiber_g")
      .order("entry_date");
    if (start) q = q.gte("entry_date", start);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      date: r.entry_date as string,
      value: r.calories as number,
      macros: {
        protein: r.protein_g ?? undefined,
        carbs: r.carbs_g ?? undefined,
        fat: r.fat_g ?? undefined,
        fiber: r.fiber_g ?? undefined,
      },
    }));
  }

  const { table, valueCol } = SINGLE_VALUE_METRICS[metric];
  let q = client.from(table).select(`entry_date, ${valueCol}`).order("entry_date");
  if (start) q = q.gte("entry_date", start);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return rows.map((r) => ({
    date: r.entry_date as string,
    value: r[valueCol] as number,
  }));
}
