import { Chart, type Plugin } from "chart.js";

/** Read a CSS custom property off :root, with a fallback. */
function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export interface ThemeColors {
  text: string;
  muted: string;
  line: string;
  accent: string;
  good: string;
  bad: string;
  gold: string;
  violet: string;
  card: string;
}

export function themeColors(): ThemeColors {
  return {
    text: cssVar("--text", "#131922"),
    muted: cssVar("--muted", "#667085"),
    line: cssVar("--grid", "#edf1f6"),
    accent: cssVar("--accent", "#0e9c73"),
    good: cssVar("--good", "#16a34a"),
    bad: cssVar("--bad", "#e0554b"),
    gold: cssVar("--gold", "#e0a83a"),
    violet: cssVar("--violet", "#7c6bd6"),
    card: cssVar("--card", "#ffffff"),
  };
}

let applied = false;
/**
 * Apply cosmetic global Chart.js defaults once (fonts, legend, tooltip only).
 * Deliberately does NOT touch responsive/maintainAspectRatio/scales/animation —
 * those are layout-affecting and are set explicitly per chart to avoid surprises.
 */
export function applyChartDefaults(): void {
  if (applied) return;
  applied = true;
  const c = themeColors();
  Chart.defaults.font.family = "'Inter', system-ui, -apple-system, 'Segoe UI', Arial, sans-serif";
  Chart.defaults.color = c.muted;

  const legend = Chart.defaults.plugins.legend;
  legend.labels.usePointStyle = true;
  legend.labels.pointStyle = "circle";
  legend.labels.boxWidth = 7;
  legend.labels.boxHeight = 7;
  legend.labels.padding = 16;

  const tip = Chart.defaults.plugins.tooltip;
  tip.padding = 10;
  tip.cornerRadius = 10;
  tip.usePointStyle = true;
  tip.boxPadding = 4;
}

/** A soft top-down gradient fill for area/line charts. */
export function areaGradient(
  ctx: CanvasRenderingContext2D,
  areaBottom: number,
  areaTop: number,
  hex: string,
  topAlpha = 0.28,
  bottomAlpha = 0.01,
): CanvasGradient {
  const g = ctx.createLinearGradient(0, areaTop, 0, areaBottom);
  g.addColorStop(0, withAlpha(hex, topAlpha));
  g.addColorStop(1, withAlpha(hex, bottomAlpha));
  return g;
}

/** Convert a hex or rgb color to rgba with the given alpha. */
export function withAlpha(color: string, alpha: number): string {
  const c = color.trim();
  if (c.startsWith("#")) {
    const h = c.slice(1);
    const full = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
    const n = parseInt(full, 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return c;
}

/** Diet-phase accent color: cut = accent (green), maintain = gold, bulk = violet. */
export function phaseColor(type: string): string {
  const c = themeColors();
  if (type === "cut") return c.accent;
  if (type === "bulk") return c.violet;
  if (type === "recomp") return cssVar("--recomp", "#0e97a8");
  return c.gold; // maintain
}

export interface PhaseBand {
  startDate: string;
  endDate: string | null;
  phaseType: string;
}

/**
 * Chart.js plugin that shades the plot background by diet phase. Works on any
 * category x-axis whose labels are ISO date strings; contiguous dates in the same
 * phase are drawn as one translucent band behind the data.
 */
export function phaseBandsPlugin(bands: PhaseBand[], today: string): Plugin {
  return {
    id: "phaseBands",
    beforeDatasetsDraw(chart) {
      if (!bands.length) return;
      const labels = (chart.data.labels ?? []) as string[];
      const x = chart.scales.x;
      const area = chart.chartArea;
      if (!labels.length || !x || !area) return;

      const phaseAt = (d: string): PhaseBand | undefined =>
        bands.find((b) => d >= b.startDate && d <= (b.endDate ?? today));
      const px = (k: number): number => x.getPixelForValue(k);
      const ctx = chart.ctx;

      let i = 0;
      while (i < labels.length) {
        const p = phaseAt(labels[i]!);
        if (!p) {
          i++;
          continue;
        }
        let j = i;
        while (j + 1 < labels.length && phaseAt(labels[j + 1]!) === p) j++;
        const left = i === 0 ? area.left : (px(i - 1) + px(i)) / 2;
        const right = j === labels.length - 1 ? area.right : (px(j) + px(j + 1)) / 2;
        ctx.save();
        ctx.fillStyle = withAlpha(phaseColor(p.phaseType), 0.13);
        ctx.fillRect(left, area.top, right - left, area.bottom - area.top);
        ctx.restore();
        i = j + 1;
      }
    },
  };
}

/** Standard cartesian scales: hidden x gridlines, soft y gridlines. Kept minimal
 *  (no `border`/font overrides) so layout matches Chart.js defaults exactly. */
export function baseScales(c: ThemeColors, yBeginAtZero = false): Record<string, unknown> {
  return {
    x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
    y: { beginAtZero: yBeginAtZero, grid: { color: c.line } },
  };
}
