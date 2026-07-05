import {
  getDashboard,
  getWeeklyInsights,
  getGoalProjection,
  getWeightOutliers,
  getPlateauAssessment,
  getDataQuality,
  triggerRecompute,
  type DashboardData,
  type WeeklyInsights,
  type GoalProjectionResult,
  type WeightOutlierResult,
  type PlateauResult,
  type DataQuality,
} from "@tdee/server";
import { supabase } from "../supabase.js";
import { el, fmt, fmtInt, fmtTimestamp, localIsoToday } from "../util.js";
import { renderMetricDetail } from "./detail.js";

const LAST_KEY = "tdee:last-dashboard";

type DetailMetric = "weight" | "bodyfat" | "steps" | "calories" | "tdee" | "balance" | "formulas";

const ICONS: Record<DetailMetric, string> = {
  balance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M7 21h10M12 6l7 2-2.5 5a3 3 0 0 1-4.5 0zM12 6 5 8l2.5 5a3 3 0 0 0 4.5 0z"/></svg>',
  formulas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5M4 19h16M9 16v-5M14 16V8M19 16v-3"/></svg>',
  tdee: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4.5 13H11l-1 9 8.5-11H12z"/></svg>',
  weight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20a8 8 0 0 1 16 0z"/><path d="M12 8l2-3"/><circle cx="12" cy="8" r="1.3" fill="currentColor"/></svg>',
  bodyfat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/></svg>',
  steps: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4c1.5 0 2.5 1.5 2.5 4S9 16 6.5 16 5 12.5 5 10 5.5 4 7 4z"/><path d="M6 16c2 0 2 4 0 4s-3-1-3-2 1-2 3-2z"/><path d="M17 8c-1.5 0-2.5 1.5-2.5 4s.5 4 3 4 1.5-3.5 1.5-6-.5-6-2-6z"/><path d="M18 16c-2 0-2 4 0 4s3-1 3-2-1-2-3-2z"/></svg>',
  calories: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c1 3-1 4-1 6a3 3 0 0 0 6 0c0-1 0-2-.5-3 2 1.5 3.5 4 3.5 7a7 7 0 0 1-14 0c0-4 3-6 3-9 1 .5 1.5 1.2 2 2z"/></svg>',
};

function sourcePill(source: string | null): HTMLElement {
  if (source === "data-driven") return el("span", { class: "pill data", text: "data-driven" });
  if (source === "estimated") return el("span", { class: "pill est", text: "estimated" });
  return el("span", { class: "pill", text: "no data" });
}

function open(root: HTMLElement, metric: DetailMetric): void {
  renderMetricDetail(root, metric, () => renderDashboard(root));
}

function metricCard(
  root: HTMLElement,
  metric: DetailMetric,
  label: string,
  value: string,
  sub?: string,
): HTMLElement {
  const card = el("div", { class: "card tap" }, [
    el("div", { class: "metric" }, [
      el("div", { class: "lead" }, [
        el("div", { class: "mi", html: ICONS[metric] }),
        el("div", {}, [el("div", { class: "value", text: value }), ...(sub ? [el("div", { class: "sub", text: sub })] : [])]),
      ]),
      el("div", {}, [el("div", { class: "label", text: label }), el("span", { class: "chev", text: "View ›" })]),
    ]),
  ]);
  card.addEventListener("click", () => open(root, metric));
  return card;
}

function heroCard(root: HTMLElement, d: DashboardData): HTMLElement {
  const t = d.calorieTarget.value;
  const tdee = d.tdee.value;
  const rows: HTMLElement[] = [sourcePill(d.tdee.source)];

  // Show the active phase so the target's intent is clear.
  const phaseLabel: Record<string, string> = { cut: "Cut phase", maintain: "Maintain phase", bulk: "Bulk phase", recomp: "Recomp phase" };
  if (d.phase && phaseLabel[d.phase]) rows.push(el("span", { class: "pill", text: phaseLabel[d.phase]! }));

  // Deficit / surplus vs maintenance (TDEE).
  if (t != null && tdee != null) {
    const diff = Math.round(t - tdee);
    if (diff === 0) rows.push(el("span", { class: "delta", text: "maintenance" }));
    else rows.push(el("span", { class: "delta", text: `${diff < 0 ? "−" : "+"}${Math.abs(diff)} vs TDEE` }));
  }
  if (d.calorieTarget.dateUnachievable) rows.push(el("span", { class: "pill warn", text: "date not achievable safely" }));
  if (d.calorieTarget.warning) rows.push(el("span", { class: "pill warn", text: d.calorieTarget.warning }));

  const big = t != null
    ? el("div", { class: "big", html: `${Math.round(t)}<small> kcal</small>` })
    : el("div", { class: "big", text: "—" });

  const phaseClass = d.phase === "maintain" ? " phase-maintain" : d.phase === "bulk" ? " phase-bulk" : d.phase === "recomp" ? " phase-recomp" : "";
  const card = el("div", { class: `card hero tap${phaseClass}` }, [
    el("div", { class: "eyebrow", text: "Eat today" }),
    big,
    el("div", { class: "sub", attrs: { style: "opacity:.85;color:#fff;margin-top:0;" }, text: tdee != null ? `TDEE ${fmtInt(tdee)} kcal` : "TDEE undetermined" }),
    el("div", { class: "row" }, rows),
  ]);
  card.addEventListener("click", () => open(root, "tdee"));
  return card;
}

interface MacroRange { lowG: number; highG: number; lowKcal: number; highKcal: number }

function macroRangeRow(name: string, range: MacroRange, target: number, color: string, avg: number | null, kcalPerG: number): HTMLElement {
  const lowPct = target > 0 ? Math.round((range.lowKcal / target) * 100) : 0;
  const highPct = target > 0 ? Math.round((range.highKcal / target) * 100) : 0;
  const width = Math.max(3, highPct - lowPct);

  // Actual 7-day average, positioned by its % of the calorie target.
  const avgPct = avg != null && target > 0 ? Math.min(100, Math.max(0, ((avg * kcalPerG) / target) * 100)) : null;
  const inBand = avg != null && avg >= range.lowG && avg <= range.highG;
  const avgColor = inBand ? "var(--good)" : "var(--gold)";

  const bar = el("div", { attrs: { style: "position:relative;height:9px;border-radius:999px;background:var(--card2);overflow:hidden;" } }, [
    el("div", { attrs: { style: `position:absolute;top:0;bottom:0;left:${lowPct}%;width:${width}%;background:${color};border-radius:999px;` } }),
    ...(avgPct != null
      ? [el("div", { attrs: { style: `position:absolute;top:0;bottom:0;left:${avgPct}%;width:3px;transform:translateX(-1.5px);background:var(--text);box-shadow:0 0 0 1px var(--card);border-radius:2px;` } })]
      : []),
  ]);

  return el("div", { attrs: { style: "margin-bottom:14px;" } }, [
    el("div", { attrs: { style: "display:flex;justify-content:space-between;font-size:13px;font-weight:700;margin-bottom:6px;" } }, [
      el("span", { text: name }),
      el("span", { attrs: { style: "color:var(--muted);font-weight:600;" }, html: `<b style="color:var(--text);">${range.lowG}–${range.highG} g</b>${avg != null ? ` · avg <b style="color:${avgColor};">${avg} g</b>` : ` · ${lowPct}–${highPct}%`}` }),
    ]),
    bar,
  ]);
}

function fiberRow(target: number | null, avg: number | null): HTMLElement {
  const hit = target != null && avg != null && avg >= target;
  const pct = target != null && target > 0 && avg != null ? Math.min(100, Math.round((avg / target) * 100)) : null;
  const right = target == null
    ? "—"
    : `${avg != null ? `avg <b style="color:${hit ? "var(--good)" : "var(--text)"};">${avg} g</b> · ` : ""}target ${target} g`;
  return el("div", { attrs: { style: "margin-top:4px;padding-top:13px;border-top:1px solid var(--line);" } }, [
    el("div", { attrs: { style: "display:flex;justify-content:space-between;font-size:13px;font-weight:700;margin-bottom:6px;" } }, [
      el("span", { text: "Fiber" }),
      el("span", { attrs: { style: "color:var(--muted);font-weight:600;" }, html: right }),
    ]),
    ...(pct != null
      ? [el("div", { attrs: { style: "height:8px;border-radius:999px;background:var(--card2);overflow:hidden;" } }, [
          el("div", { attrs: { style: `height:100%;width:${pct}%;border-radius:999px;background:${hit ? "var(--good)" : "var(--accent)"};transition:width .5s ease;` } }),
        ])]
      : [el("div", { class: "muted", attrs: { style: "font-size:11px;" }, text: "Log fiber to track it against target." })]),
  ]);
}

function macroCard(d: DashboardData): HTMLElement | null {
  if (!d.macros) return null;
  const m = d.macros;
  const target = d.calorieTarget.value ?? 0;
  return el("div", { class: "card" }, [
    el("h2", { text: "Macro targets" }),
    macroRangeRow("Protein", m.protein, target, "var(--accent)", d.macroAvg?.protein ?? null, 4),
    macroRangeRow("Carbs", m.carbs, target, "var(--gold)", d.macroAvg?.carbs ?? null, 4),
    macroRangeRow("Fat", m.fat, target, "var(--bad)", d.macroAvg?.fat ?? null, 9),
    fiberRow(d.fiber?.target ?? null, d.fiber?.average7d ?? null),
    el("p", { class: "muted", attrs: { style: "margin:12px 0 0;" }, html: `Coloured band = target range; the <b style="color:var(--text);">▏</b>marker is your 7-day average intake. Protein ${m.proteinPerKg.low}–${m.proteinPerKg.high} g/kg for your activity level; fiber 14 g per 1000 kcal.` }),
  ]);
}

function aboutCard(): HTMLElement {
  const body = el("div", { class: "about-body" }, [
    el("p", { html: "<b>Your calorie target</b> starts from your TDEE — measured from your own calorie intake and weight-trend history (7700 kcal per kg of weight change), or estimated from the Mifflin-St Jeor equation × your activity level until there's enough logged data — then adjusted for your goal at a healthy, BMI-capped weekly rate (never below 1200 kcal)." }),
    el("p", { html: "<b>Macros are shown as ranges, not fixed numbers</b>, because that's how the evidence is framed:" }),
    el("ul", {}, [
      el("li", { html: "<b>Protein</b> is scaled to your body weight and activity. The RDA (0.8 g/kg) only prevents deficiency; active adults do well around 1.2–1.6 g/kg, and the 1.6–2.2 g/kg top end mainly helps resistance training or dieting (to preserve muscle) — you don't need the high end otherwise." }),
      el("li", { html: "<b>Fat</b> is 20–35% of calories, with a ~0.5 g/kg floor for essential fatty acids and hormonal health." }),
      el("li", { html: "<b>Carbs</b> fill the remaining calories — there's no strict requirement, so the band is whatever's left." }),
      el("li", { html: "<b>Fiber</b> targets 14 g per 1000 kcal (IOM). It aids weight management through satiety, slower digestion, a gentler blood-sugar response, and gut-microbiome benefits." }),
    ]),
    el("p", { class: "src", html: "Sources: ISSN Position Stand on Protein &amp; Exercise (2017); Institute of Medicine Acceptable Macronutrient Distribution Ranges; WHO total-fat guidance. Educational only — not medical advice." }),
  ]);
  return el("details", { class: "about" }, [el("summary", { text: "How your targets are calculated" }), body]);
}

function stat(label: string, valueHtml: string, note?: string): HTMLElement {
  return el("div", { attrs: { style: "background:var(--card2);border-radius:14px;padding:13px 14px;" } }, [
    el("div", { attrs: { style: "font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;color:var(--muted);margin-bottom:6px;" }, text: label }),
    el("div", { attrs: { style: "font-size:20px;font-weight:800;letter-spacing:-.4px;" }, html: valueHtml }),
    ...(note ? [el("div", { attrs: { style: "font-size:11px;color:var(--faint);margin-top:3px;font-weight:600;" }, text: note })] : []),
  ]);
}

function rate(kg: number | null): string {
  if (kg == null) return "—";
  const sign = kg > 0.005 ? "+" : kg < -0.005 ? "−" : "";
  return `${sign}${Math.abs(kg).toFixed(2)}<small style="font-size:12px;font-weight:700;color:var(--muted);"> kg/wk</small>`;
}

function insightsCard(w: WeeklyInsights): HTMLElement | null {
  // Only worth showing once there's at least some intake data this week.
  if (w.avgIntake7d == null && w.actualWeeklyRateKg == null) return null;

  const stats: HTMLElement[] = [];

  // Average intake with week-over-week delta.
  if (w.avgIntake7d != null) {
    let note: string | undefined;
    if (w.avgIntakePrev7d != null) {
      const delta = Math.round(w.avgIntake7d - w.avgIntakePrev7d);
      note = delta === 0 ? "same as last week" : `${delta < 0 ? "−" : "+"}${Math.abs(delta)} vs last week`;
    }
    stats.push(stat("Avg intake", `${Math.round(w.avgIntake7d)}<small style="font-size:12px;font-weight:700;color:var(--muted);"> kcal</small>`, note));
  }

  // Adherence to target.
  if (w.adherencePct != null) {
    const on = w.adherencePct >= 95 && w.adherencePct <= 108;
    const color = on ? "var(--good)" : "var(--gold)";
    stats.push(stat("Adherence", `<span style="color:${color};">${w.adherencePct}%</span>`, "of calorie target"));
  }

  // Actual weekly weight change (trend-based).
  stats.push(stat("Weight change", rate(w.actualWeeklyRateKg), "trend, last 7 days"));

  // Protein adherence vs recommended range.
  if (w.avgProtein7d != null) {
    let note = "avg this week";
    let color = "var(--text)";
    if (w.proteinTargetLowG != null && w.proteinTargetHighG != null) {
      const inRange = w.avgProtein7d >= w.proteinTargetLowG;
      color = inRange ? "var(--good)" : "var(--gold)";
      note = inRange ? `≥ ${w.proteinTargetLowG} g target ✓` : `below ${w.proteinTargetLowG}–${w.proteinTargetHighG} g`;
    }
    stats.push(stat("Protein", `<span style="color:${color};">${w.avgProtein7d}</span><small style="font-size:12px;font-weight:700;color:var(--muted);"> g</small>`, note));
  }

  // Fiber adherence vs target.
  if (w.avgFiber7d != null) {
    const hit = w.fiberTarget != null && w.avgFiber7d >= w.fiberTarget;
    const color = w.fiberTarget != null ? (hit ? "var(--good)" : "var(--gold)") : "var(--text)";
    stats.push(stat("Fiber", `<span style="color:${color};">${w.avgFiber7d}</span><small style="font-size:12px;font-weight:700;color:var(--muted);"> g</small>`, w.fiberTarget != null ? `of ${w.fiberTarget} g target` : "avg this week"));
  }

  // Logged days.
  stats.push(stat("Days logged", `${w.loggedDays7d}<small style="font-size:12px;font-weight:700;color:var(--muted);"> / 7</small>`, "calories this week"));

  return el("div", { class: "card" }, [
    el("h2", { text: "This week" }),
    el("div", { attrs: { style: "display:grid;grid-template-columns:1fr 1fr;gap:10px;" } }, stats),
  ]);
}

function fmtDateLong(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** A start→goal progress bar with a "you are here" fill and % complete. */
function goalProgressBar(startKg: number | null, currentKg: number | null, goalKg: number | null): HTMLElement | null {
  if (startKg == null || currentKg == null || goalKg == null || startKg === goalKg) return null;
  const pct = Math.max(0, Math.min(100, ((startKg - currentKg) / (startKg - goalKg)) * 100));
  const remaining = Math.abs(goalKg - currentKg);
  return el("div", { attrs: { style: "margin-top:12px;" } }, [
    el("div", { attrs: { style: "position:relative;height:9px;border-radius:999px;background:var(--card2);overflow:hidden;" } }, [
      el("div", { attrs: { style: `position:absolute;top:0;bottom:0;left:0;width:${pct}%;background:var(--accent);border-radius:999px;transition:width .5s ease;` } }),
    ]),
    el("div", { attrs: { style: "display:flex;justify-content:space-between;margin-top:6px;font-size:12px;color:var(--muted);font-weight:600;" } }, [
      el("span", { text: `${startKg.toFixed(1)} → ${goalKg.toFixed(1)} kg` }),
      el("span", { html: `<b style="color:var(--text);">${Math.round(pct)}%</b> · ${remaining.toFixed(1)} kg to go` }),
    ]),
  ]);
}

function projectionCard(r: GoalProjectionResult | null, phase: string | null): HTMLElement | null {
  if (!r || !r.hasGoal) return null;
  const goalKg = r.goalWeightKg != null ? `${r.goalWeightKg.toFixed(1)} kg` : "your goal";
  const prog = goalProgressBar(r.startWeightKg, r.currentTrendKg, r.goalWeightKg);

  // During a maintenance phase, the goal isn't being pursued — don't show an ETA.
  if (phase === "maintain") {
    return el("div", { class: "card" }, [
      el("h2", { text: "Goal projection" }),
      el("div", { class: "metric" }, [
        el("div", {}, [
          el("div", { class: "value", attrs: { style: "font-size:19px;" }, text: "Goal paused" }),
          el("div", { class: "sub", text: `Maintaining${r.currentTrendKg != null ? ` at ~${r.currentTrendKg.toFixed(1)} kg` : ""} — resume a cut or bulk to pursue ${goalKg}.` }),
        ]),
      ]),
      ...(prog ? [prog] : []),
    ]);
  }

  const p = r.projection;
  if (!p) {
    return el("div", { class: "card" }, [
      el("h2", { text: "Goal projection" }),
      el("div", { class: "metric" }, [
        el("div", {}, [el("div", { class: "value", attrs: { style: "font-size:19px;" }, text: "Not enough data yet" }), el("div", { class: "sub", text: `Keep logging weight — a couple of weeks lets me project when you'll hit ${goalKg}.` })]),
      ]),
      ...(prog ? [prog] : []),
    ]);
  }

  const rateVal = p.weeklyRateKg;
  const rateStr = `${rateVal < 0 ? "−" : "+"}${Math.abs(rateVal).toFixed(2)} kg/wk`;

  let mainValue: string;
  let subText: string;
  let badge: HTMLElement | null = null;

  switch (p.status) {
    case "reached":
      mainValue = "At goal 🎉";
      subText = `You've reached ${goalKg}.`;
      break;
    case "stalled":
      mainValue = "No ETA";
      subText = `Weight trend is flat (${rateStr}).`;
      break;
    case "wrong_direction":
      mainValue = "Off track";
      subText = `Trend is moving away from ${goalKg} (${rateStr}).`;
      badge = el("span", { class: "pill warn", text: "wrong way" });
      break;
    default: {
      mainValue = `~${fmtDateLong(p.projectedDate)}`;
      if (p.status === "projecting") {
        subText = `On pace to reach ${goalKg} · ${rateStr}`;
      } else {
        subText = `Reach ${goalKg} · target ${fmtDateLong(r.goalDate)} · ${rateStr}`;
        const wk = Math.round(Math.abs(p.daysVsGoalDate ?? 0) / 7);
        if (p.status === "ahead") badge = el("span", { class: "pill data", text: `≈${wk} wk early` });
        else if (p.status === "behind") badge = el("span", { class: "pill warn", text: `≈${wk} wk late` });
        else badge = el("span", { class: "pill data", text: "on track" });
      }
    }
  }

  return el("div", { class: "card" }, [
    el("h2", { text: "Goal projection" }),
    el("div", { class: "metric" }, [
      el("div", {}, [el("div", { class: "value", attrs: { style: "font-size:22px;" }, text: mainValue }), el("div", { class: "sub", text: subText })]),
      ...(badge ? [el("div", {}, [badge])] : []),
    ]),
    ...(prog ? [prog] : []),
  ]);
}

function plateauCard(r: PlateauResult | null): HTMLElement | null {
  if (!r || r.assessment.status !== "plateau") return null;
  const a = r.assessment;
  const wks = a.windowDays ? Math.round(a.windowDays / 7) : null;
  const kcalTxt = a.maintenanceKcal != null ? ` (about ${a.maintenanceKcal} kcal/day)` : "";

  const evidence = el("details", { class: "about" }, [
    el("summary", { text: "What the research says" }),
    el("div", { class: "about-body" }, [
      el("p", { html: "A stall almost always means the calorie deficit has closed — not a “broken” or “starvation-mode” metabolism. Two well-documented drivers:" }),
      el("ul", {}, [
        el("li", { html: "<b>Lower body mass burns fewer calories</b>, so a once-effective intake gradually becomes maintenance." }),
        el("li", { html: "<b>Intake creeps up and is under-recorded</b> — “diet-resistant” people have been shown to under-report intake by ~40–50% on average, which alone explains many plateaus." }),
      ]),
      el("p", { html: "<b>Adaptive thermogenesis</b> (a fall in expenditure beyond what lost weight predicts) is real but <b>modest</b> — on the order of tens of kcal/day — and reviews find it inconsistent and often overstated. It slows progress slightly; it doesn't stop it." }),
      el("p", { class: "src", html: "Sources: Lichtenstein &amp; Heymsfield, NEJM 1992 (self-report discrepancy); Thomas et al., AJCN 2014 (adherence &amp; the plateau); systematic reviews of adaptive thermogenesis (e.g. Br J Nutr, 2021). Educational only — not medical advice." }),
    ]),
  ]);

  return el("div", { class: "card" }, [
    el("h2", { text: "Plateau check" }),
    el("p", { attrs: { style: "margin:0 0 10px;font-size:14px;line-height:1.5;" }, html: `Your weight trend has been essentially flat over the last ~${wks ?? 2} weeks. At a steady weight you're eating around maintenance${kcalTxt} — the deficit has closed. That's expected physiology, <b>not</b> a damaged metabolism.` }),
    el("p", { class: "muted", attrs: { style: "margin:0 0 6px;font-weight:700;color:var(--text);" }, text: "To resume losing (pick one):" }),
    el("ul", { attrs: { style: "margin:0 0 4px;padding-left:18px;font-size:13px;color:var(--muted);line-height:1.55;" } }, [
      el("li", { html: "Tighten logging for a week — under-recording (oils, drinks, portions) is the most common cause." }),
      el("li", { html: "Or trim ~150–250 kcal/day to reopen a modest deficit; keep protein high to protect muscle." }),
      el("li", { html: "Or hold here — maintenance is a perfectly valid, healthy choice." }),
    ]),
    evidence,
  ]);
}

function coverageRow(name: string, logged: number, total: number, color: string): HTMLElement {
  const pct = total > 0 ? Math.round((logged / total) * 100) : 0;
  return el("div", { attrs: { style: "margin-bottom:12px;" } }, [
    el("div", { attrs: { style: "display:flex;justify-content:space-between;font-size:13px;font-weight:700;margin-bottom:6px;" } }, [
      el("span", { text: name }),
      el("span", { attrs: { style: "color:var(--muted);font-weight:600;" }, html: `<b style="color:var(--text);">${logged}</b> / ${total} days` }),
    ]),
    el("div", { attrs: { style: "height:8px;border-radius:999px;background:var(--card2);overflow:hidden;" } }, [
      el("div", { attrs: { style: `height:100%;width:${pct}%;border-radius:999px;background:${color};transition:width .5s ease;` } }),
    ]),
  ]);
}

function dataQualityCard(q: DataQuality | null): HTMLElement | null {
  if (!q) return null;
  const conf =
    q.confidence === "high"
      ? { pill: "data", label: "High", note: "Plenty of recent logs — your data-driven TDEE is on solid footing." }
      : q.confidence === "good"
        ? { pill: "data", label: "Good", note: "Enough recent data for a data-driven TDEE." }
        : { pill: "warn", label: "Limited", note: "Sparse recent calorie logs — TDEE may fall back to an estimate. Logging more days improves accuracy." };
  return el("div", { class: "card" }, [
    el("h2", { text: "Data quality" }),
    coverageRow("Calories logged", q.calorieDaysLogged, q.windowDays, "var(--accent)"),
    coverageRow("Weight logged", q.weightDaysLogged, q.windowDays, "var(--gold)"),
    el("div", { attrs: { style: "display:flex;align-items:center;gap:8px;margin-top:4px;" } }, [
      el("span", { text: "TDEE confidence", attrs: { style: "font-size:13px;font-weight:700;" } }),
      el("span", { class: `pill ${conf.pill}`, text: conf.label }),
    ]),
    el("p", { class: "muted", attrs: { style: "margin:8px 0 0;" }, text: conf.note }),
  ]);
}

function render(
  root: HTMLElement,
  d: DashboardData,
  insights: WeeklyInsights | null,
  projection: GoalProjectionResult | null,
  outliers: WeightOutlierResult | null,
  plateau: PlateauResult | null,
  dataQuality: DataQuality | null,
  stale: boolean,
): void {
  const today = localIsoToday();
  const banners: HTMLElement[] = [];
  if (stale) banners.push(el("div", { class: "banner warn", text: "Offline — showing the last data loaded. It may be out of date." }));
  const syncedToday = d.syncTimestamp?.slice(0, 10) === today;
  if (!stale && !syncedToday) {
    banners.push(el("div", { class: "banner info", text: "Today's data may be incomplete — not all of today has synced yet." }));
  }

  // Weight-outlier warning (skews trend + TDEE) — offer a jump to review it.
  const flagged = outliers?.outliers ?? [];
  if (flagged.length > 0) {
    const o = flagged[0]!;
    const more = flagged.length > 1 ? ` (+${flagged.length - 1} more)` : "";
    const reviewBtn = el("button", { class: "btn secondary small", text: "Review" });
    reviewBtn.addEventListener("click", () => open(root, "weight"));
    banners.push(
      el("div", { class: "banner warn", attrs: { style: "justify-content:space-between;" } }, [
        el("span", { attrs: { style: "flex:1;" }, text: `A weight entry looks off: ${o.value} kg on ${o.date} vs a trend of ≈${Math.round(o.expected)} kg${more}. It may skew your charts.` }),
        reviewBtn,
      ]),
    );
  }

  const bf = d.bodyfat.average7d != null ? d.bodyfat.average7d * 100 : null;
  const bfLatest = d.bodyfat.latest ? `latest ${fmt(d.bodyfat.latest.value * 100)}%` : undefined;

  const recomputeBtn = el("button", { class: "btn secondary small", text: "Recompute now" });
  const recomputeMsg = el("span", { class: "muted" });
  recomputeBtn.addEventListener("click", () => {
    recomputeBtn.setAttribute("disabled", "true");
    recomputeMsg.textContent = "Recomputing…";
    triggerRecompute(supabase as never, today)
      .then(() => load(root))
      .catch(() => {
        recomputeMsg.textContent = "Recompute failed.";
        recomputeBtn.removeAttribute("disabled");
      });
  });

  const macros = macroCard(d);
  const week = insights ? insightsCard(insights) : null;

  const lastSync = el("div", { class: "card" }, [
    el("div", { class: "metric" }, [
      el("div", {}, [el("div", { class: "label", attrs: { style: "text-align:left;" }, text: "Last sync" }), el("div", { class: "sub", text: fmtTimestamp(d.syncTimestamp) })]),
      recomputeBtn,
    ]),
    el("div", { class: "sub" }, [recomputeMsg]),
  ]);

  const balanceCard = el("div", { class: "card tap" }, [
    el("div", { class: "metric" }, [
      el("div", { class: "lead" }, [
        el("div", { class: "mi", html: ICONS.balance }),
        el("div", {}, [el("div", { class: "value", attrs: { style: "font-size:19px;" }, text: "Intake vs burn" }), el("div", { class: "sub", text: "deficit / surplus over time" })]),
      ]),
      el("div", {}, [el("div", { class: "label", text: "Energy balance" }), el("span", { class: "chev", text: "View ›" })]),
    ]),
  ]);
  balanceCard.addEventListener("click", () => open(root, "balance"));

  const formulasCard = el("div", { class: "card tap" }, [
    el("div", { class: "metric" }, [
      el("div", { class: "lead" }, [
        el("div", { class: "mi", html: ICONS.formulas }),
        el("div", {}, [el("div", { class: "value", attrs: { style: "font-size:19px;" }, text: "Formula check" }), el("div", { class: "sub", text: "measured vs. textbook TDEE" })]),
      ]),
      el("div", {}, [el("div", { class: "label", text: "Formulas" }), el("span", { class: "chev", text: "View ›" })]),
    ]),
  ]);
  formulasCard.addEventListener("click", () => open(root, "formulas"));

  const proj = projectionCard(projection, d.phase);
  const plat = plateauCard(plateau);
  const dq = dataQualityCard(dataQuality);

  const grid = el("div", { class: "dash-grid" }, [
    heroCard(root, d),
    ...(macros ? [macros] : []),
    ...(proj ? [proj] : []),
    ...(plat ? [plat] : []),
    ...(week ? [week] : []),
    ...(dq ? [dq] : []),
    balanceCard,
    formulasCard,
    metricCard(root, "tdee", "TDEE", fmtInt(d.tdee.value, " kcal")),
    metricCard(root, "weight", "Weight · 7-day avg", fmt(d.weight.average7d, 1, " kg"), d.weight.latest ? `latest ${fmt(d.weight.latest.value, 1)} kg` : undefined),
    metricCard(root, "bodyfat", "Body fat · 7-day avg", fmt(bf, 1, "%"), bfLatest),
    metricCard(root, "steps", "Steps · latest", fmtInt(d.steps.latest?.value), d.steps.latest?.date),
    metricCard(root, "calories", "Calories · latest", fmtInt(d.calories.latest?.value, " kcal"), d.calories.latest?.date),
    lastSync,
  ]);

  root.replaceChildren(...banners, grid, aboutCard());
}

function skeleton(root: HTMLElement): void {
  const card = (children: Node[]) => el("div", { class: "card" }, children);
  root.replaceChildren(
    el("div", { class: "card hero" }, [el("div", { class: "skel big", attrs: { style: "background:rgba(255,255,255,.25);" } })]),
    card([el("div", { class: "skel line", attrs: { style: "width:70%" } }), el("div", { class: "skel line", attrs: { style: "width:40%" } })]),
    card([el("div", { class: "skel line", attrs: { style: "width:70%" } }), el("div", { class: "skel line", attrs: { style: "width:40%" } })]),
    card([el("div", { class: "skel line", attrs: { style: "width:70%" } }), el("div", { class: "skel line", attrs: { style: "width:40%" } })]),
  );
}

interface CachedPayload {
  d: DashboardData;
  insights: WeeklyInsights | null;
  projection: GoalProjectionResult | null;
  outliers: WeightOutlierResult | null;
  plateau: PlateauResult | null;
  dataQuality: DataQuality | null;
}

async function load(root: HTMLElement): Promise<void> {
  skeleton(root);
  const today = localIsoToday();
  try {
    const [data, insights, projection, outliers, plateau, dataQuality] = await Promise.all([
      getDashboard(supabase as never, today),
      getWeeklyInsights(supabase as never, today).catch(() => null),
      getGoalProjection(supabase as never, today).catch(() => null),
      getWeightOutliers(supabase as never, today).catch(() => null),
      getPlateauAssessment(supabase as never, today).catch(() => null),
      getDataQuality(supabase as never, today).catch(() => null),
    ]);
    localStorage.setItem(LAST_KEY, JSON.stringify({ d: data, insights, projection, outliers, plateau, dataQuality } satisfies CachedPayload));
    render(root, data, insights, projection, outliers, plateau, dataQuality, false);
  } catch {
    const cached = localStorage.getItem(LAST_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as CachedPayload | DashboardData;
      // Support both the new combined shape and any older cache (dashboard-only).
      if ("d" in parsed) render(root, parsed.d, parsed.insights, parsed.projection ?? null, parsed.outliers ?? null, parsed.plateau ?? null, parsed.dataQuality ?? null, true);
      else render(root, parsed, null, null, null, null, null, true);
    } else {
      root.replaceChildren(el("div", { class: "card" }, [el("p", { class: "err", text: "Could not load dashboard and no cached data is available." })]));
    }
  }
}

export function renderDashboard(root: HTMLElement): void {
  void load(root);
}
