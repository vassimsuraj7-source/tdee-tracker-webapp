import { Chart, registerables, type ChartConfiguration } from "chart.js";
import {
  listEntries,
  deleteEntry,
  saveEntry,
  getMainGoal,
  getTdeeHistory,
  type Metric,
  type TimeRange,
  type GoalType,
} from "@tdee/server";
import { fillMissingWeightData, trendWeight } from "@tdee/engine";
import { supabase } from "../supabase.js";
import { el, fmt, fmtInt, localIsoToday } from "../util.js";

Chart.register(...registerables);

const client = () => supabase as never;

type DetailMetric = "weight" | "bodyfat" | "steps" | "calories" | "tdee";

interface Cfg {
  title: string;
  unit: string;
  decimals: number;
  scale: number; // display multiplier (body fat fraction -> %)
  goalType?: GoalType;
  kind: "trend" | "bars" | "macros" | "tdee";
}

const CFG: Record<DetailMetric, Cfg> = {
  weight: { title: "Weight", unit: "kg", decimals: 1, scale: 1, goalType: "weight", kind: "trend" },
  bodyfat: { title: "Body fat", unit: "%", decimals: 1, scale: 100, goalType: "body_fat", kind: "trend" },
  steps: { title: "Steps", unit: "", decimals: 0, scale: 1, kind: "bars" },
  calories: { title: "Calories", unit: "kcal", decimals: 0, scale: 1, kind: "macros" },
  tdee: { title: "TDEE", unit: "kcal", decimals: 0, scale: 1, kind: "tdee" },
};

const chartRegistry = new WeakMap<HTMLCanvasElement, Chart>();
function drawChart(canvas: HTMLCanvasElement, config: ChartConfiguration): void {
  chartRegistry.get(canvas)?.destroy();
  const chart = new Chart(canvas, config);
  chartRegistry.set(canvas, chart);
}

async function currentTdee(): Promise<number | null> {
  const { data } = await supabase.from("current_target").select("tdee_used").eq("id", 1).limit(1);
  return (data?.[0]?.tdee_used as number | null) ?? null;
}

async function loadChartAndList(
  metric: DetailMetric,
  range: TimeRange,
  canvas: HTMLCanvasElement,
  listBox: HTMLElement,
): Promise<void> {
  const cfg = CFG[metric];
  const today = localIsoToday();

  if (metric === "tdee") {
    const history = await getTdeeHistory(client());
    drawChart(canvas, {
      type: "line",
      data: {
        labels: history.map((h) => h.windowEnd),
        datasets: [
          { label: "TDEE (kcal)", data: history.map((h) => Math.round(h.value)), borderColor: "#0e7a5f", backgroundColor: "#0e7a5f", tension: 0.25, pointRadius: 2 },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true } } },
    });
    listBox.replaceChildren(
      el("p", { class: "muted", text: `${history.length} calculated windows.` }),
    );
    return;
  }

  const entries = await listEntries(client(), metric as Metric, range, today);
  const rows = metric === "calories" ? entries.filter((e) => e.value > 0) : entries;
  const labels = rows.map((r) => r.date);

  if (cfg.kind === "trend") {
    const filled = fillMissingWeightData(
      rows.map((r) => ({ date: r.date, value: r.value })),
      rows[0]?.date ?? today,
      rows[rows.length - 1]?.date ?? today,
    );
    const raw = rows.map((r) => r.value * cfg.scale);
    const trend = rows.map((r) => {
      const t = trendWeight(filled, r.date, 7);
      return t === undefined ? null : t * cfg.scale;
    });
    const pointColors = rows.map((r, i) => {
      const t = trend[i];
      if (t == null) return "#5b6472";
      return r.value * cfg.scale <= t ? "#0f9d58" : "#d64545"; // below trend = green
    });

    const datasets: Record<string, unknown>[] = [
      { label: `${cfg.title} (${cfg.unit})`, data: raw, borderColor: "#c9d2dc", pointBackgroundColor: pointColors, pointRadius: 3, tension: 0, borderWidth: 1 },
      { label: "Trend (7-day avg)", data: trend, borderColor: "#0e7a5f", pointRadius: 0, tension: 0.3, borderWidth: 2, spanGaps: true },
    ];

    if (cfg.goalType) {
      const goal = await getMainGoal(client(), cfg.goalType);
      if (goal) {
        const gv = goal.target_value * cfg.scale;
        datasets.push({ label: "Goal", data: labels.map(() => gv), borderColor: "#e6bf57", borderDash: [6, 4], pointRadius: 0, borderWidth: 2 });
      }
    }

    drawChart(canvas, {
      type: "line",
      data: { labels, datasets: datasets as never },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true } }, scales: { y: { beginAtZero: false } } },
    });
  } else if (cfg.kind === "bars") {
    drawChart(canvas, {
      type: "bar",
      data: { labels, datasets: [{ label: cfg.title, data: rows.map((r) => r.value), backgroundColor: "#0e7a5f" }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
    });
  } else if (cfg.kind === "macros") {
    const tdee = await currentTdee();
    const protein = rows.map((r) => Math.round((r.macros?.protein ?? 0) * 4));
    const carbs = rows.map((r) => Math.round((r.macros?.carbs ?? 0) * 4));
    const fat = rows.map((r) => Math.round((r.macros?.fat ?? 0) * 9));
    const alcohol = rows.map((r, i) => {
      const known = protein[i]! + carbs[i]! + fat[i]!;
      const a = Math.round(r.value - known);
      return a > 0 && a <= r.value ? a : 0; // positive + within bound (Req 19.2)
    });
    const datasets: Record<string, unknown>[] = [
      { label: "Protein", data: protein, backgroundColor: "#0e7a5f", stack: "macros" },
      { label: "Carbs", data: carbs, backgroundColor: "#e6bf57", stack: "macros" },
      { label: "Fat", data: fat, backgroundColor: "#d64545", stack: "macros" },
      { label: "Alcohol", data: alcohol, backgroundColor: "#8a63d2", stack: "macros" },
    ];
    if (tdee != null) {
      datasets.push({ type: "line", label: "TDEE", data: labels.map(() => Math.round(tdee)), borderColor: "#161b22", borderDash: [6, 4], pointRadius: 0, borderWidth: 2 });
    }
    drawChart(canvas, {
      type: "bar",
      data: { labels, datasets: datasets as never },
      options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } },
    });
  }

  renderList(metric, rows, listBox, canvas, range);
}

function renderList(
  metric: DetailMetric,
  rows: { date: string; value: number }[],
  listBox: HTMLElement,
  canvas: HTMLCanvasElement,
  range: TimeRange,
): void {
  const cfg = CFG[metric];
  const items = [...rows].reverse().map((r) => {
    const display = fmt(r.value * cfg.scale, cfg.decimals, cfg.unit ? " " + cfg.unit : "");
    const edit = el("button", { class: "btn secondary small", text: "Edit" });
    edit.addEventListener("click", async () => {
      const entered = prompt(`New ${cfg.title} for ${r.date} (${cfg.unit || "value"}):`, String(r.value * cfg.scale));
      if (entered == null) return;
      const n = Number(entered);
      if (!Number.isFinite(n) || n < 0) return alert("Invalid value.");
      await saveEntry(client(), metric as Metric, { date: r.date, value: n / cfg.scale });
      await loadChartAndList(metric, range, canvas, listBox);
    });
    const del = el("button", { class: "btn danger small", text: "Delete" });
    del.addEventListener("click", async () => {
      if (!confirm(`Delete ${cfg.title} entry for ${r.date}?`)) return;
      await deleteEntry(client(), metric as Metric, r.date);
      await loadChartAndList(metric, range, canvas, listBox);
    });
    return el("div", { class: "list-item" }, [
      el("span", { text: `${r.date}  ·  ${display}` }),
      el("span", {}, [edit, el("span", { text: " " }), del]),
    ]);
  });
  listBox.replaceChildren(
    el("h2", { text: "History" }),
    ...(items.length ? items : [el("p", { class: "muted", text: "No entries in this range." })]),
  );
}

function addForm(metric: DetailMetric, onSaved: () => void): HTMLElement {
  const cfg = CFG[metric];
  const date = el("input", { attrs: { type: "date", value: localIsoToday() } }) as HTMLInputElement;
  const value = el("input", { attrs: { type: "number", step: "0.1", placeholder: cfg.unit || "value" } }) as HTMLInputElement;
  const msg = el("p", { class: "err" });
  const btn = el("button", { class: "btn small", text: "Add / update entry" });

  // Optional macros for calories.
  const macroInputs: Record<string, HTMLInputElement> = {};
  const macroFields: HTMLElement[] = [];
  if (metric === "calories") {
    for (const m of ["protein", "carbs", "fat", "fiber"]) {
      const inp = el("input", { attrs: { type: "number", step: "1", placeholder: "g" } }) as HTMLInputElement;
      macroInputs[m] = inp;
      macroFields.push(el("label", { text: `${m} (g)` }, [inp]));
    }
  }

  btn.addEventListener("click", async () => {
    msg.textContent = "";
    const n = Number(value.value);
    if (!date.value || !Number.isFinite(n) || n < 0) {
      msg.textContent = "Enter a valid date and non-negative value.";
      return;
    }
    try {
      const entry: { date: string; value: number; macros?: Record<string, number> } = {
        date: date.value,
        value: metric === "calories" ? n : n / cfg.scale,
      };
      if (metric === "calories") {
        entry.macros = {};
        for (const m of ["protein", "carbs", "fat", "fiber"]) {
          const v = Number(macroInputs[m]!.value);
          if (Number.isFinite(v) && v > 0) entry.macros[m] = v;
        }
      }
      await saveEntry(client(), metric as Metric, entry as never);
      value.value = "";
      onSaved();
    } catch (e) {
      msg.textContent = e instanceof Error ? e.message : "Failed to save.";
    }
  });

  return el("div", { class: "card" }, [
    el("h2", { text: "Add / edit an entry" }),
    el("div", { class: "row2" }, [el("label", { text: "Date" }, [date]), el("label", { text: cfg.title + (cfg.unit ? ` (${cfg.unit})` : "") }, [value])]),
    ...macroFields,
    btn,
    msg,
    el("p", { class: "muted", text: "Weight/calorie changes are picked up on the next recompute (use \u201CRecompute now\u201D on the dashboard)." }),
  ]);
}

export function renderMetricDetail(root: HTMLElement, metric: DetailMetric, onBack: () => void): void {
  const cfg = CFG[metric];
  let range: TimeRange = "30d";

  const back = el("button", { class: "btn secondary small", text: "\u2190 Back" });
  back.addEventListener("click", onBack);

  const rangeSelect = el("select") as HTMLSelectElement;
  for (const [v, label] of [["7d", "7 days"], ["30d", "30 days"], ["90d", "90 days"], ["all", "All"]] as const) {
    rangeSelect.append(el("option", { text: label, attrs: { value: v } }));
  }
  rangeSelect.value = range;

  const canvas = el("canvas") as HTMLCanvasElement;
  const chartBox = el("div", { attrs: { style: "position:relative;height:280px;" } }, [canvas]);
  const listBox = el("div", {});

  async function reload(): Promise<void> {
    await loadChartAndList(metric, range, canvas, listBox);
  }
  rangeSelect.addEventListener("change", () => {
    range = rangeSelect.value as TimeRange;
    void reload();
  });

  const children: (Node | string)[] = [
    el("div", { class: "metric" }, [el("h2", { text: cfg.title }), back]),
    el("div", { class: "card" }, [
      ...(metric === "tdee" ? [] : [el("label", { text: "Time range" }, [rangeSelect])]),
      chartBox,
    ]),
    listBox,
  ];
  if (metric !== "tdee") children.push(addForm(metric, () => void reload()));

  root.replaceChildren(el("div", {}, children));
  void reload();
}
