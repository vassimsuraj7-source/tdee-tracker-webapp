import { getDashboard, triggerRecompute, type DashboardData } from "@tdee/server";
import { supabase } from "../supabase.js";
import { el, fmt, fmtInt, fmtTimestamp, localIsoToday } from "../util.js";
import { renderMetricDetail } from "./detail.js";

const LAST_KEY = "tdee:last-dashboard";

type DetailMetric = "weight" | "bodyfat" | "steps" | "calories" | "tdee";

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
  const card = el("div", { class: "card", attrs: { style: "cursor:pointer;" } }, [
    el("div", { class: "metric" }, [
      el("div", {}, [el("div", { class: "value", text: value }), ...(sub ? [el("div", { class: "sub", text: sub })] : [])]),
      el("div", {}, [el("div", { class: "label", text: label }), el("span", { class: "muted", text: "view ›" })]),
    ]),
  ]);
  card.addEventListener("click", () => open(root, metric));
  return card;
}

function render(root: HTMLElement, d: DashboardData, stale: boolean): void {
  const today = localIsoToday();
  const banners: HTMLElement[] = [];
  if (stale) banners.push(el("div", { class: "banner warn", text: "Offline — showing the last data loaded. It may be out of date." }));
  const syncedToday = d.syncTimestamp?.slice(0, 10) === today;
  if (!stale && !syncedToday) {
    banners.push(el("div", { class: "banner info", text: "Today's data may be incomplete — not all of today has synced yet." }));
  }

  // Calorie target hero (opens TDEE detail).
  const targetSub: HTMLElement[] = [el("div", { class: "sub", text: `from TDEE ${fmtInt(d.tdee.value)} kcal` })];
  if (d.calorieTarget.dateUnachievable) targetSub.push(el("div", { class: "sub" }, [el("span", { class: "pill warn", text: "goal date not achievable at a healthy pace" })]));
  if (d.calorieTarget.warning) targetSub.push(el("div", { class: "sub" }, [el("span", { class: "pill warn", text: d.calorieTarget.warning })]));
  const targetCard = el("div", { class: "card", attrs: { style: "cursor:pointer;" } }, [
    el("div", { class: "metric" }, [
      el("div", {}, [el("div", { class: "value", text: fmtInt(d.calorieTarget.value, " kcal") }), ...targetSub]),
      el("div", {}, [el("div", { class: "label", text: "Eat today" }), sourcePill(d.tdee.source)]),
    ]),
  ]);
  targetCard.addEventListener("click", () => open(root, "tdee"));

  const bf = d.bodyfat.average7d != null ? d.bodyfat.average7d * 100 : null;
  const bfLatest = d.bodyfat.latest ? `latest ${fmt(d.bodyfat.latest.value * 100)}%` : undefined;

  const recomputeBtn = el("button", { class: "btn secondary small", text: "Recompute now" });
  const recomputeMsg = el("span", { class: "muted" });
  recomputeBtn.addEventListener("click", async () => {
    recomputeBtn.setAttribute("disabled", "true");
    recomputeMsg.textContent = "Recomputing…";
    try {
      await triggerRecompute(supabase as never, today);
      await load(root);
    } catch {
      recomputeMsg.textContent = "Recompute failed.";
      recomputeBtn.removeAttribute("disabled");
    }
  });

  root.replaceChildren(
    ...banners,
    targetCard,
    metricCard(root, "tdee", "TDEE", fmtInt(d.tdee.value, " kcal")),
    metricCard(root, "weight", "Weight (7-day avg)", fmt(d.weight.average7d, 1, " kg"), d.weight.latest ? `latest ${fmt(d.weight.latest.value, 1)} kg` : undefined),
    metricCard(root, "bodyfat", "Body fat (7-day avg)", fmt(bf, 1, "%"), bfLatest),
    metricCard(root, "steps", "Steps (latest)", fmtInt(d.steps.latest?.value), d.steps.latest?.date),
    metricCard(root, "calories", "Calories (latest)", fmtInt(d.calories.latest?.value, " kcal"), d.calories.latest?.date),
    el("div", { class: "card" }, [
      el("div", { class: "metric" }, [
        el("div", {}, [el("div", { class: "label", text: "Last sync" }), el("div", { class: "sub", text: fmtTimestamp(d.syncTimestamp) })]),
        recomputeBtn,
      ]),
      el("div", { class: "sub" }, [recomputeMsg]),
    ]),
  );
}

async function load(root: HTMLElement): Promise<void> {
  root.replaceChildren(el("div", { class: "card" }, [el("p", { class: "muted", text: "Loading…" })]));
  try {
    const data = await getDashboard(supabase as never, localIsoToday());
    localStorage.setItem(LAST_KEY, JSON.stringify(data));
    render(root, data, false);
  } catch {
    const cached = localStorage.getItem(LAST_KEY);
    if (cached) render(root, JSON.parse(cached) as DashboardData, true);
    else root.replaceChildren(el("div", { class: "card" }, [el("p", { class: "err", text: "Could not load dashboard and no cached data is available." })]));
  }
}

export function renderDashboard(root: HTMLElement): void {
  void load(root);
}
