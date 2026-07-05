import { Chart, registerables, type ChartConfiguration } from "chart.js";
import {
  listEntries,
  deleteEntry,
  saveEntry,
  getMainGoal,
  getTdeeHistory,
  getFormulaComparison,
  getPhases,
  type Metric,
  type TimeRange,
  type GoalType,
} from "@tdee/server";
import { fillMissingWeightData, trendWeight } from "@tdee/engine";
import { supabase } from "../supabase.js";
import { el, fmt, fmtInt, localIsoToday } from "../util.js";
import { applyChartDefaults, themeColors, withAlpha, baseScales, phaseBandsPlugin, type PhaseBand } from "../chartTheme.js";

Chart.register(...registerables);
applyChartDefaults();

const client = () => supabase as never;

type DetailMetric = "weight" | "bodyfat" | "steps" | "calories" | "tdee" | "balance" | "formulas";

interface Cfg {
  title: string;
  unit: string;
  decimals: number;
  scale: number; // display multiplier (body fat fraction -> %)
  goalType?: GoalType;
  kind: "trend" | "bars" | "macros" | "tdee" | "balance" | "formulas";
}

const CFG: Record<DetailMetric, Cfg> = {
  weight: { title: "Weight", unit: "kg", decimals: 1, scale: 1, goalType: "weight", kind: "trend" },
  bodyfat: { title: "Body fat", unit: "%", decimals: 1, scale: 100, goalType: "body_fat", kind: "trend" },
  steps: { title: "Steps", unit: "", decimals: 0, scale: 1, kind: "bars" },
  calories: { title: "Calories", unit: "kcal", decimals: 0, scale: 1, kind: "macros" },
  tdee: { title: "TDEE", unit: "kcal", decimals: 0, scale: 1, kind: "tdee" },
  balance: { title: "Energy balance", unit: "kcal", decimals: 0, scale: 1, kind: "balance" },
  formulas: { title: "Formula comparison", unit: "kcal", decimals: 0, scale: 1, kind: "formulas" },
};

const chartRegistry = new WeakMap<HTMLCanvasElement, Chart>();
function drawChart(canvas: HTMLCanvasElement, config: ChartConfiguration): void {
  chartRegistry.get(canvas)?.destroy();
  // Ensure responsive sizing regardless of global defaults.
  config.options = { responsive: true, maintainAspectRatio: false, ...(config.options ?? {}) };
  try {
    const chart = new Chart(canvas, config);
    chartRegistry.set(canvas, chart);
  } catch (e) {
    // Surface the real error on screen instead of failing silently.
    const box = canvas.parentElement;
    if (box) box.replaceChildren(el("p", { class: "err", text: "Chart error: " + (e instanceof Error ? e.message : String(e)) }));
  }
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

  const c = themeColors();

  // Diet-phase background bands for time-series charts (not the formula comparison).
  let bands: PhaseBand[] = [];
  if (metric !== "formulas") {
    const phaseList = await getPhases(client(), today).catch(() => []);
    bands = phaseList.map((p) => ({ startDate: p.phase.startDate, endDate: p.phase.endDate, phaseType: p.phase.phaseType }));
  }

  if (metric === "tdee") {
    const history = await getTdeeHistory(client());
    drawChart(canvas, {
      type: "line",
      data: {
        labels: history.map((h) => h.windowEnd),
        datasets: [
          {
            label: "TDEE (kcal)",
            data: history.map((h) => Math.round(h.value)),
            borderColor: c.accent,
            fill: false,
            tension: 0.35,
            pointRadius: 0,
            pointHoverRadius: 5,
            borderWidth: 2.5,
          },
        ],
      },
      options: { plugins: { legend: { display: false } }, scales: baseScales(c) as never, interaction: { mode: "index", intersect: false } },
      plugins: [phaseBandsPlugin(bands, today)],
    });
    listBox.replaceChildren(
      el("p", { class: "muted", text: `${history.length} calculated windows.` }),
    );
    return;
  }

  if (metric === "balance") {
    // Overlay daily intake (bars) against expenditure/TDEE (line) so the
    // deficit/surplus gap is visible. Expenditure per day = the most recent
    // TDEE_Record effective on or before that day (carried forward).
    const cals = (await listEntries(client(), "calories", range, today)).filter((e) => e.value > 0);
    const history = await getTdeeHistory(client());
    const sorted = [...history].sort((a, b) => (a.windowEnd < b.windowEnd ? -1 : 1));
    const expenditureOn = (date: string): number | null => {
      let v: number | null = null;
      for (const h of sorted) {
        if (h.windowEnd <= date) v = h.value;
        else break;
      }
      return v;
    };
    const labels = cals.map((r) => r.date);
    const intake = cals.map((r) => Math.round(r.value));
    const expenditure = cals.map((r) => {
      const e = expenditureOn(r.date);
      return e == null ? null : Math.round(e);
    });

    drawChart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            type: "bar",
            label: "Intake",
            data: intake,
            backgroundColor: withAlpha(c.accent, 0.5),
            borderRadius: 4,
            borderSkipped: false,
            maxBarThickness: 22,
            order: 2,
          },
          {
            type: "line",
            label: "Expenditure (TDEE)",
            data: expenditure,
            borderColor: c.gold,
            backgroundColor: withAlpha(c.gold, 0.12),
            fill: false,
            tension: 0.35,
            pointRadius: 0,
            pointHoverRadius: 4,
            borderWidth: 2.5,
            spanGaps: true,
            order: 1,
          },
        ] as never,
      },
      options: { plugins: { legend: { display: true } }, scales: baseScales(c, true) as never, interaction: { mode: "index", intersect: false } },
      plugins: [phaseBandsPlugin(bands, today)],
    });

    const valExp = expenditure.filter((x): x is number => x != null);
    const avgIn = intake.length ? Math.round(intake.reduce((s, x) => s + x, 0) / intake.length) : null;
    const avgExp = valExp.length ? Math.round(valExp.reduce((s, x) => s + x, 0) / valExp.length) : null;
    const net = avgIn != null && avgExp != null ? avgIn - avgExp : null;
    const wk = net != null ? (net * 7) / 7700 : null;

    const summary = el("div", { class: "card" }, [
      el("h2", { text: "Over this range" }),
      el("div", { class: "list-item" }, [el("span", { class: "k", text: "Avg intake" }), el("span", { text: avgIn != null ? `${avgIn} kcal` : "—" })]),
      el("div", { class: "list-item" }, [el("span", { class: "k", text: "Avg expenditure" }), el("span", { text: avgExp != null ? `${avgExp} kcal` : "—" })]),
      el("div", { class: "list-item" }, [
        el("span", { class: "k", text: "Net balance" }),
        el("span", {
          attrs: { style: `font-weight:800;color:${net == null ? "var(--muted)" : net < 0 ? "var(--good)" : "var(--bad)"};` },
          text: net != null ? `${net < 0 ? "−" : "+"}${Math.abs(net)} kcal/day` : "—",
        }),
      ]),
      el("div", { class: "list-item" }, [
        el("span", { class: "k", text: "Implied rate" }),
        el("span", { text: wk != null ? `${wk < 0 ? "−" : "+"}${Math.abs(wk).toFixed(2)} kg/week` : "—" }),
      ]),
      el("p", { class: "muted", attrs: { style: "margin:8px 0 0;" }, text: "Bars = calories eaten; line = estimated calories burned (TDEE). Bars below the line mean a deficit." }),
    ]);
    listBox.replaceChildren(summary);
    return;
  }

  if (metric === "formulas") {
    const cmp = await getFormulaComparison(client(), today);

    if (cmp.estimates.length === 0) {
      chartRegistry.get(canvas)?.destroy();
      listBox.replaceChildren(
        el("div", { class: "card" }, [
          el("p", { class: "muted", text: `Add your ${cmp.missing.join(", ")} in Settings to compare against the literature formulas.` }),
        ]),
      );
      return;
    }

    const labels: string[] = [];
    const values: number[] = [];
    const colors: string[] = [];
    if (cmp.dataDriven.value != null) {
      labels.push("Your TDEE (measured)");
      values.push(Math.round(cmp.dataDriven.value));
      colors.push(c.accent);
    }
    for (const e of cmp.estimates) {
      if (e.tdee != null) {
        labels.push(e.name);
        values.push(Math.round(e.tdee));
        colors.push(withAlpha(c.gold, 0.85));
      }
    }

    drawChart(canvas, {
      type: "bar",
      data: { labels, datasets: [{ label: "TDEE (kcal)", data: values, backgroundColor: colors, borderRadius: 6, borderSkipped: false, maxBarThickness: 34 }] },
      options: {
        indexAxis: "y",
        plugins: { legend: { display: false } },
        scales: { x: { grid: { color: c.line }, ticks: { maxTicksLimit: 6 } }, y: { grid: { display: false } } },
      },
    });

    const rows: HTMLElement[] = [];
    if (cmp.dataDriven.value != null) {
      rows.push(
        el("div", { class: "list-item" }, [
          el("span", { class: "k", text: "Your TDEE (measured)" }),
          el("span", { attrs: { style: "font-weight:800;color:var(--accent);" }, text: `${Math.round(cmp.dataDriven.value)} kcal` }),
        ]),
      );
    }
    for (const e of cmp.estimates) {
      rows.push(
        el("div", { class: "list-item" }, [
          el("div", {}, [el("div", { class: "k", text: e.name }), el("div", { class: "muted", attrs: { style: "font-size:11px;" }, text: e.basis })]),
          el("span", { text: e.tdee != null ? `${Math.round(e.tdee)} kcal` : "needs body-fat %" }),
        ]),
      );
    }

    const bfNote = cmp.inputs.bodyFatFraction != null
      ? ` Body fat ${(cmp.inputs.bodyFatFraction * 100).toFixed(1)}% enables the lean-mass formulas.`
      : " Log a body-fat % to unlock the Katch-McArdle and Cunningham formulas.";

    listBox.replaceChildren(
      el("div", { class: "card" }, [
        el("h2", { text: "TDEE by method" }),
        ...rows,
        el("p", { class: "muted", attrs: { style: "margin-top:10px;" }, text: `Estimates = BMR × activity PAL ${cmp.activityPal}.${bfNote}` }),
        el("p", { class: "muted", attrs: { style: "margin-top:6px;" }, text: "Your measured TDEE comes from your actual intake and weight-trend history — for you personally it's more accurate than any population formula." }),
      ]),
    );
    return;
  }

  const entries = await listEntries(client(), metric as Metric, range, today);
  const rows = metric === "calories" ? entries.filter((e) => e.value > 0) : entries;
  const labels = rows.map((r) => r.date);

  if (cfg.kind === "trend") {
    // Compute the 7-day trend over the FULL history (not just the visible range) so
    // the moving average is already determined at the left edge of the window.
    // Otherwise the trend "starts late" — the first ~6 in-range days would lack the
    // preceding days the average needs. We still only DISPLAY the selected range.
    const full = range === "all" ? rows : await listEntries(client(), metric as Metric, "all", today);
    const filled = fillMissingWeightData(
      full.map((r) => ({ date: r.date, value: r.value })),
      full[0]?.date ?? today,
      full[full.length - 1]?.date ?? today,
    );
    const raw = rows.map((r) => r.value * cfg.scale);
    const trend = rows.map((r) => {
      const t = trendWeight(filled, r.date, 7);
      return t === undefined ? null : t * cfg.scale;
    });
    const pointColors = rows.map((r, i) => {
      const t = trend[i];
      if (t == null) return c.muted;
      return r.value * cfg.scale <= t ? c.good : c.bad; // below trend = green
    });

    const datasets: Record<string, unknown>[] = [
      {
        label: `${cfg.title} (${cfg.unit})`,
        data: raw,
        showLine: false,
        pointBackgroundColor: pointColors,
        pointBorderColor: pointColors,
        pointRadius: 2.5,
        pointHoverRadius: 5,
      },
      {
        label: "Trend (7-day avg)",
        data: trend,
        borderColor: c.accent,
        fill: false,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.35,
        borderWidth: 2.5,
        spanGaps: true,
      },
    ];

    if (cfg.goalType) {
      const goal = await getMainGoal(client(), cfg.goalType);
      if (goal) {
        const gv = goal.target_value * cfg.scale;
        datasets.push({ label: "Goal", data: labels.map(() => gv), borderColor: c.gold, borderDash: [6, 5], pointRadius: 0, borderWidth: 2, fill: false });
      }
    }

    drawChart(canvas, {
      type: "line",
      data: { labels, datasets: datasets as never },
      options: { plugins: { legend: { display: true } }, scales: baseScales(c) as never, interaction: { mode: "index", intersect: false } },
      plugins: [phaseBandsPlugin(bands, today)],
    });
  } else if (cfg.kind === "bars") {
    drawChart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: cfg.title,
            data: rows.map((r) => r.value),
            backgroundColor: c.accent,
            borderRadius: 6,
            borderSkipped: false,
            maxBarThickness: 26,
          },
        ],
      },
      options: { plugins: { legend: { display: false } }, scales: baseScales(c, true) as never },
      plugins: [phaseBandsPlugin(bands, today)],
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
      { label: "Protein", data: protein, backgroundColor: c.accent, stack: "macros", borderRadius: 4, borderSkipped: false, maxBarThickness: 26 },
      { label: "Carbs", data: carbs, backgroundColor: c.gold, stack: "macros", borderRadius: 4, borderSkipped: false, maxBarThickness: 26 },
      { label: "Fat", data: fat, backgroundColor: c.bad, stack: "macros", borderRadius: 4, borderSkipped: false, maxBarThickness: 26 },
      { label: "Alcohol", data: alcohol, backgroundColor: c.violet, stack: "macros", borderRadius: 4, borderSkipped: false, maxBarThickness: 26 },
    ];
    if (tdee != null) {
      datasets.push({ type: "line", label: "TDEE", data: labels.map(() => Math.round(tdee)), borderColor: c.text, borderDash: [6, 5], pointRadius: 0, borderWidth: 2 });
    }
    const macroScales = baseScales(c, true);
    (macroScales.x as Record<string, unknown>).stacked = true;
    (macroScales.y as Record<string, unknown>).stacked = true;
    drawChart(canvas, {
      type: "bar",
      data: { labels, datasets: datasets as never },
      options: { scales: macroScales as never, interaction: { mode: "index", intersect: false } },
      plugins: [phaseBandsPlugin(bands, today)],
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

  const canvas = el("canvas") as HTMLCanvasElement;
  const chartBox = el("div", { class: "chart-box" }, [canvas]);
  const listBox = el("div", {});

  async function reload(): Promise<void> {
    await loadChartAndList(metric, range, canvas, listBox);
  }

  const segmented = el("div", { class: "segmented" });
  const rangeButtons = new Map<TimeRange, HTMLButtonElement>();
  for (const [v, label] of [["7d", "7D"], ["30d", "30D"], ["90d", "90D"], ["all", "All"]] as const) {
    const b = el("button", { text: label }) as HTMLButtonElement;
    b.classList.toggle("active", v === range);
    b.addEventListener("click", () => {
      range = v;
      for (const [id, btn] of rangeButtons) btn.classList.toggle("active", id === v);
      void reload();
    });
    rangeButtons.set(v, b);
    segmented.append(b);
  }

  const children: (Node | string)[] = [
    el("div", { class: "metric", attrs: { style: "margin-bottom:14px;" } }, [el("h2", { attrs: { style: "margin:0;font-size:19px;color:var(--text);text-transform:none;letter-spacing:-.4px;" }, text: cfg.title }), back]),
    el("div", { class: "card" }, [
      ...(metric === "tdee" || metric === "formulas" ? [] : [segmented]),
      chartBox,
      ...(metric === "formulas"
        ? []
        : [el("p", { class: "muted", attrs: { style: "font-size:11px;margin:8px 0 0;" }, html: "Shaded bands = diet phases · <span style=\"color:var(--accent);font-weight:700;\">cut</span> · <span style=\"color:var(--gold);font-weight:700;\">maintain</span> · <span style=\"color:var(--recomp);font-weight:700;\">recomp</span> · <span style=\"color:var(--violet);font-weight:700;\">bulk</span>" })]),
    ]),
    listBox,
  ];
  if (metric !== "tdee" && metric !== "balance" && metric !== "formulas") children.push(addForm(metric, () => void reload()));

  root.replaceChildren(el("div", { class: "readable" }, children));
  void reload();
}
