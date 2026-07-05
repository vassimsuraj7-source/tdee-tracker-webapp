import { addDays, diffDays, fillMissingWeightData, trendWeight } from "@tdee/engine";
import type { SupabaseClient } from "./db.js";
import { loadWeights, loadCalories } from "./repository.js";
import { ValidationError } from "./errors.js";

export type PhaseType = "cut" | "maintain" | "bulk";

export interface DietPhase {
  id: string;
  phaseType: PhaseType;
  startDate: string;
  endDate: string | null; // null => ongoing
  note: string | null;
}

export interface PhaseSummary {
  ongoing: boolean;
  durationDays: number;
  weightDeltaKg: number | null;
  weeklyRateKg: number | null;
  avgIntakeKcal: number | null;
  avgTdee: number | null;
}

export interface PhaseWithSummary {
  phase: DietPhase;
  summary: PhaseSummary;
}

const isPhaseType = (v: string): v is PhaseType => v === "cut" || v === "maintain" || v === "bulk";

/** List all phases (most recent first) with a computed summary for each. */
export async function getPhases(client: SupabaseClient, today: string): Promise<PhaseWithSummary[]> {
  const [phasesRes, weights, calories] = await Promise.all([
    client.from("diet_phases").select("id, phase_type, start_date, end_date, note").order("start_date", { ascending: false }),
    loadWeights(client),
    loadCalories(client),
  ]);
  if (phasesRes.error) throw new Error(phasesRes.error.message);
  const phaseRows = (phasesRes.data ?? []) as {
    id: string;
    phase_type: PhaseType;
    start_date: string;
    end_date: string | null;
    note: string | null;
  }[];

  const { data: tdeeData, error: tdeeErr } = await client.from("tdee_records").select("window_end, value").order("window_end");
  if (tdeeErr) throw new Error(tdeeErr.message);
  const tdeeRows = (tdeeData ?? []) as { window_end: string; value: number }[];

  const filled = weights.length > 0 ? fillMissingWeightData(weights, weights[0]!.date, today) : [];

  return phaseRows.map((r) => {
    const start = r.start_date;
    const end = r.end_date ?? today;
    const ongoing = r.end_date == null;

    const startTrend = filled.length ? trendWeight(filled, start, 7) : undefined;
    const endTrend = filled.length ? trendWeight(filled, end, 7) : undefined;
    const weightDeltaKg = startTrend !== undefined && endTrend !== undefined ? endTrend - startTrend : null;

    const durationDays = Math.max(1, diffDays(start, end));

    const intake = calories.filter((c) => c.value > 0 && c.date >= start && c.date <= end).map((c) => c.value);
    const avgIntakeKcal = intake.length ? Math.round(intake.reduce((s, v) => s + v, 0) / intake.length) : null;

    const tdees = tdeeRows.filter((t) => t.window_end >= start && t.window_end <= end).map((t) => t.value);
    const avgTdee = tdees.length ? Math.round(tdees.reduce((s, v) => s + v, 0) / tdees.length) : null;

    const weeklyRateKg = weightDeltaKg != null ? weightDeltaKg / (durationDays / 7) : null;

    return {
      phase: { id: r.id, phaseType: r.phase_type, startDate: r.start_date, endDate: r.end_date, note: r.note },
      summary: { ongoing, durationDays, weightDeltaKg, weeklyRateKg, avgIntakeKcal, avgTdee },
    };
  });
}

/** Start a new phase, automatically closing any currently-open phase the day before. */
export async function startPhase(
  client: SupabaseClient,
  input: { phaseType: string; startDate: string; note?: string | null },
): Promise<void> {
  if (!isPhaseType(input.phaseType)) throw new ValidationError("phase type must be cut, maintain, or bulk");
  if (!input.startDate) throw new ValidationError("a start date is required");

  const { data: openData, error: openErr } = await client
    .from("diet_phases")
    .select("id, start_date")
    .is("end_date", null)
    .limit(1);
  if (openErr) throw new Error(openErr.message);
  const open = openData?.[0] as { id: string; start_date: string } | undefined;

  if (open) {
    let prevEnd = addDays(input.startDate, -1);
    if (prevEnd < open.start_date) prevEnd = open.start_date; // guard the end >= start constraint
    const { error } = await client.from("diet_phases").update({ end_date: prevEnd }).eq("id", open.id);
    if (error) throw new Error(error.message);
  }

  const { error } = await client
    .from("diet_phases")
    .insert({ phase_type: input.phaseType, start_date: input.startDate, note: input.note ?? null });
  if (error) throw new Error(error.message);
}

/** End the currently-open phase on the given date. */
export async function endCurrentPhase(client: SupabaseClient, endDate: string): Promise<void> {
  const { data, error } = await client.from("diet_phases").select("id").is("end_date", null).limit(1);
  if (error) throw new Error(error.message);
  const open = data?.[0] as { id: string } | undefined;
  if (!open) return;
  const { error: upErr } = await client.from("diet_phases").update({ end_date: endDate }).eq("id", open.id);
  if (upErr) throw new Error(upErr.message);
}

/** Delete a phase by id. */
export async function deletePhase(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from("diet_phases").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
