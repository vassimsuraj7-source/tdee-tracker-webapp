import {
  getDashboard,
  getWeeklyInsights,
  triggerRecompute,
  type DashboardData,
  type WeeklyInsights,
} from "@tdee/server";
import { supabase } from "../supabase.js";
import { el, fmt, fmtInt, fmtTimestamp, localIsoToday } from "../util.js";
import { renderMetricDetail } from "./detail.js";

const LAST_KEY = "tdee:last-dashboard";

type DetailMetric = "weight" | "bodyfat" | "steps" | "calories" | "tdee" | "balance";

const ICONS: Record<DetailMetric, string> = {
  balance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M7 21h10M12 6l7 2-2.5 5a3 3 0 0 1-4.5 0zM12 6 5 8l2.5 5a3 3 0 0 0 4.5 0z"/></svg>',
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

  const card = el("div", { class: "card hero tap" }, [
    el("div", { class: "eyebrow", text: "Eat today" }),
    big,
    el("div", { class: "sub", attrs: { style: "opacity:.85;color:#fff;margin-top:0;" }, text: tdee != null ? `TDEE ${fmtInt(tdee)} kcal` : "TDEE undetermined" }),
    el("div", { class: "row" }, rows),
  ]);
  card.addEventListener("click", () => open(root, "tdee"));
  return card;
}

function macroRow(name: string, grams: number, kcal: number, totalKcal: number, color: string): HTMLElement {
  const pct = totalKcal > 0 ? Math.round((kcal / totalKcal) * 100) : 0;
  return el("div", { attrs: { style: "margin-bottom:12px;" } }, [
    el("div", { attrs: { style: "display:flex;justify-content:space-between;font-size:13px;font-weight:700;margin-bottom:6px;" } }, [
      el("span", { text: name }),
      el("span", { attrs: { style: "color:var(--muted);font-weight:600;" }, html: `<b style="color:var(--text);">${grams} g</b> · ${pct}%` }),
    ]),
    el("div", { attrs: { style: "height:8px;border-radius:999px;background:var(--card2);overflow:hidden;" } }, [
      el("div", { attrs: { style: `height:100%;width:${pct}%;border-radius:999px;background:${color};transition:width .5s ease;` } }),
    ]),
  ]);
}

function macroCard(d: DashboardData): HTMLElement | null {
  if (!d.macros) return null;
  const m = d.macros;
  const total = m.proteinKcal + m.fatKcal + m.carbsKcal;
  return el("div", { class: "card" }, [
    el("h2", { text: "Macro targets" }),
    macroRow("Protein", m.proteinG, m.proteinKcal, total, "var(--accent)"),
    macroRow("Carbs", m.carbsG, m.carbsKcal, total, "var(--gold)"),
    macroRow("Fat", m.fatG, m.fatKcal, total, "var(--bad)"),
    el("p", { class: "muted", attrs: { style: "margin:2px 0 0;" }, text: "Protein-first split from your calorie target and trend weight." }),
  ]);
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

  // Logged days.
  stats.push(stat("Days logged", `${w.loggedDays7d}<small style="font-size:12px;font-weight:700;color:var(--muted);"> / 7</small>`, "calories this week"));

  return el("div", { class: "card" }, [
    el("h2", { text: "This week" }),
    el("div", { attrs: { style: "display:grid;grid-template-columns:1fr 1fr;gap:10px;" } }, stats),
  ]);
}

function render(root: HTMLElement, d: DashboardData, insights: WeeklyInsights | null, stale: boolean): void {
  const today = localIsoToday();
  const banners: HTMLElement[] = [];
  if (stale) banners.push(el("div", { class: "banner warn", text: "Offline — showing the last data loaded. It may be out of date." }));
  const syncedToday = d.syncTimestamp?.slice(0, 10) === today;
  if (!stale && !syncedToday) {
    banners.push(el("div", { class: "banner info", text: "Today's data may be incomplete — not all of today has synced yet." }));
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

  const grid = el("div", { class: "dash-grid" }, [
    heroCard(root, d),
    ...(macros ? [macros] : []),
    ...(week ? [week] : []),
    balanceCard,
    metricCard(root, "tdee", "TDEE", fmtInt(d.tdee.value, " kcal")),
    metricCard(root, "weight", "Weight · 7-day avg", fmt(d.weight.average7d, 1, " kg"), d.weight.latest ? `latest ${fmt(d.weight.latest.value, 1)} kg` : undefined),
    metricCard(root, "bodyfat", "Body fat · 7-day avg", fmt(bf, 1, "%"), bfLatest),
    metricCard(root, "steps", "Steps · latest", fmtInt(d.steps.latest?.value), d.steps.latest?.date),
    metricCard(root, "calories", "Calories · latest", fmtInt(d.calories.latest?.value, " kcal"), d.calories.latest?.date),
    lastSync,
  ]);

  root.replaceChildren(...banners, grid);
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
}

async function load(root: HTMLElement): Promise<void> {
  skeleton(root);
  const today = localIsoToday();
  try {
    const [data, insights] = await Promise.all([
      getDashboard(supabase as never, today),
      getWeeklyInsights(supabase as never, today).catch(() => null),
    ]);
    localStorage.setItem(LAST_KEY, JSON.stringify({ d: data, insights } satisfies CachedPayload));
    render(root, data, insights, false);
  } catch {
    const cached = localStorage.getItem(LAST_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as CachedPayload | DashboardData;
      // Support both the new combined shape and any older cache (dashboard-only).
      if ("d" in parsed) render(root, parsed.d, parsed.insights, true);
      else render(root, parsed, null, true);
    } else {
      root.replaceChildren(el("div", { class: "card" }, [el("p", { class: "err", text: "Could not load dashboard and no cached data is available." })]));
    }
  }
}

export function renderDashboard(root: HTMLElement): void {
  void load(root);
}
