import {
  getPhases,
  startPhase,
  endCurrentPhase,
  deletePhase,
  triggerRecompute,
  type PhaseType,
  type PhaseWithSummary,
} from "@tdee/server";
import { supabase } from "../supabase.js";
import { el, localIsoToday } from "../util.js";

const client = () => supabase as never;

/** Refresh the stored calorie target after a phase change (non-fatal on failure). */
async function recomputeQuietly(): Promise<void> {
  try {
    await triggerRecompute(client(), localIsoToday());
  } catch {
    /* recompute is best-effort here; the nightly job / manual button will catch up */
  }
}

const PHASE_LABEL: Record<PhaseType, string> = { cut: "Cut (deficit)", maintain: "Maintain", bulk: "Bulk (surplus)", recomp: "Recomposition" };
const PHASE_COLOR: Record<PhaseType, string> = { cut: "var(--accent)", maintain: "var(--gold)", bulk: "var(--violet)", recomp: "var(--recomp)" };
const PHASE_HELP: Record<PhaseType, string> = {
  cut: "Eat in a deficit toward your weight goal to lose fat.",
  maintain: "Eat at maintenance (your TDEE) to hold weight steady.",
  bulk: "Eat in a surplus toward your weight goal to gain.",
  recomp: "A gentle deficit (~10% of TDEE, max 250 kcal) with high protein + resistance training — lose fat while holding/building muscle. Works best for beginners, higher body fat, or those returning to training.",
};

function rate(kg: number | null): string {
  if (kg == null) return "—";
  const sign = kg > 0.005 ? "+" : kg < -0.005 ? "−" : "";
  return `${sign}${Math.abs(kg).toFixed(2)} kg/wk`;
}

function delta(kg: number | null): string {
  if (kg == null) return "—";
  const sign = kg > 0.05 ? "+" : kg < -0.05 ? "−" : "";
  return `${sign}${Math.abs(kg).toFixed(1)} kg`;
}

function summaryStats(p: PhaseWithSummary): HTMLElement {
  const s = p.summary;
  const wk = Math.max(1, Math.round(s.durationDays / 7));
  const stat = (label: string, value: string) =>
    el("div", { attrs: { style: "background:var(--card2);border-radius:12px;padding:10px 12px;" } }, [
      el("div", { attrs: { style: "font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;color:var(--muted);margin-bottom:4px;" }, text: label }),
      el("div", { attrs: { style: "font-size:16px;font-weight:800;letter-spacing:-.3px;" }, html: value }),
    ]);
  return el("div", { attrs: { style: "display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;" } }, [
    stat("Duration", `${s.durationDays}<small style="font-size:11px;color:var(--muted);font-weight:700;"> d (${wk} wk)</small>`),
    stat("Weight change", delta(s.weightDeltaKg)),
    stat("Rate", rate(s.weeklyRateKg)),
    stat("Avg intake", s.avgIntakeKcal != null ? `${s.avgIntakeKcal}<small style="font-size:11px;color:var(--muted);font-weight:700;"> kcal</small>` : "—"),
    stat("Avg expenditure", s.avgTdee != null ? `${s.avgTdee}<small style="font-size:11px;color:var(--muted);font-weight:700;"> kcal</small>` : "—"),
  ]);
}

function startForm(onDone: () => void): HTMLElement {
  const type = el("select") as HTMLSelectElement;
  for (const t of ["cut", "maintain", "recomp", "bulk"] as PhaseType[]) type.append(el("option", { text: PHASE_LABEL[t], attrs: { value: t } }));
  const date = el("input", { attrs: { type: "date", value: localIsoToday() } }) as HTMLInputElement;
  const note = el("input", { attrs: { type: "text", placeholder: "Note (optional)" } }) as HTMLInputElement;
  const help = el("p", { class: "muted", attrs: { style: "font-size:12px;margin:-4px 0 12px;line-height:1.5;" }, text: PHASE_HELP[type.value as PhaseType] });
  type.addEventListener("change", () => {
    help.textContent = PHASE_HELP[type.value as PhaseType];
  });
  const msg = el("p", { class: "err" });
  const btn = el("button", { class: "btn small", text: "Start phase" });
  btn.addEventListener("click", async () => {
    msg.textContent = "";
    btn.setAttribute("disabled", "true");
    btn.textContent = "Starting…";
    try {
      await startPhase(client(), { phaseType: type.value, startDate: date.value, note: note.value.trim() || null });
      await recomputeQuietly();
      note.value = "";
      onDone();
    } catch (e) {
      btn.removeAttribute("disabled");
      btn.textContent = "Start phase";
      msg.textContent = e instanceof Error ? e.message : "Failed to start phase.";
    }
  });
  return el("div", { class: "card" }, [
    el("h2", { text: "Start a new phase" }),
    el("p", { class: "muted", attrs: { style: "margin:0 0 12px;" }, text: "Starting a phase automatically closes the current one." }),
    el("div", { class: "row2" }, [el("label", { text: "Type" }, [type]), el("label", { text: "Start date" }, [date])]),
    help,
    el("label", { text: "Note" }, [note]),
    btn,
    msg,
  ]);
}

function phaseCard(p: PhaseWithSummary, reload: () => void, current: boolean): HTMLElement {
  const s = p.summary;
  const rangeText = `${p.phase.startDate} → ${p.phase.endDate ?? "now"}`;
  const badge = el("span", { class: "pill", attrs: { style: `background:color-mix(in srgb, ${PHASE_COLOR[p.phase.phaseType]} 18%, var(--card));color:${PHASE_COLOR[p.phase.phaseType]};` }, text: PHASE_LABEL[p.phase.phaseType] });

  const actions: HTMLElement[] = [];
  if (current) {
    const endBtn = el("button", { class: "btn secondary small", text: "End phase" });
    endBtn.addEventListener("click", async () => {
      endBtn.setAttribute("disabled", "true");
      endBtn.textContent = "Ending…";
      await endCurrentPhase(client(), localIsoToday());
      await recomputeQuietly();
      reload();
    });
    actions.push(endBtn);
  }
  const del = el("button", { class: "btn danger small", text: "Delete" });
  del.addEventListener("click", async () => {
    if (!confirm("Delete this phase? (Your entries are not affected.)")) return;
    await deletePhase(client(), p.phase.id);
    reload();
  });
  actions.push(del);

  return el("div", { class: "card" }, [
    el("div", { class: "metric" }, [
      el("div", {}, [badge, el("div", { class: "sub", attrs: { style: "margin-top:6px;" }, text: rangeText }), ...(p.phase.note ? [el("div", { class: "sub", text: p.phase.note })] : [])]),
      ...(current ? [el("span", { class: "pill data", text: "current" })] : []),
    ]),
    summaryStats(p),
    el("div", { class: "btn-row", attrs: { style: "margin-top:12px;" } }, actions),
    ...(s.ongoing && s.weightDeltaKg != null ? [el("p", { class: "muted", attrs: { style: "margin:8px 0 0;font-size:12px;" }, text: "Live so far — updates as you log." })] : []),
  ]);
}

async function load(root: HTMLElement): Promise<void> {
  root.replaceChildren(el("div", { class: "card" }, [el("p", { class: "muted", text: "Loading…" })]));
  try {
    const phases = await getPhases(client(), localIsoToday());
    const reload = () => void load(root);
    const current = phases.find((p) => p.summary.ongoing) ?? null;
    const past = phases.filter((p) => !p.summary.ongoing);

    const children: (Node | string)[] = [startForm(reload)];
    if (current) children.push(el("h2", { attrs: { style: "font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.2px;margin:4px 2px;" }, text: "Current phase" }), phaseCard(current, reload, true));
    if (past.length) {
      children.push(el("h2", { attrs: { style: "font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.2px;margin:12px 2px 4px;" }, text: "History" }));
      for (const p of past) children.push(phaseCard(p, reload, false));
    }
    if (!current && !past.length) children.push(el("div", { class: "card" }, [el("p", { class: "muted", text: "No phases yet. Start one above to track a cut, maintenance, or bulk." })]));

    root.replaceChildren(el("div", { class: "readable" }, children));
  } catch (e) {
    root.replaceChildren(el("div", { class: "card" }, [el("p", { class: "err", text: e instanceof Error ? e.message : "Could not load phases." })]));
  }
}

export function renderPhases(root: HTMLElement): void {
  void load(root);
}
