import { Chart, type ScaleOptionsByType } from "chart.js";

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
/** Apply global Chart.js defaults once (fonts, tooltip, legend styling). */
export function applyChartDefaults(): void {
  if (applied) return;
  applied = true;
  const c = themeColors();
  Chart.defaults.font.family = "'Inter', system-ui, -apple-system, 'Segoe UI', Arial, sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.color = c.muted;
  Chart.defaults.borderColor = c.line;
  Chart.defaults.maintainAspectRatio = false;
  Chart.defaults.responsive = true;
  Chart.defaults.animation = { duration: 550, easing: "easeOutQuart" };

  const legend = Chart.defaults.plugins.legend;
  legend.labels.usePointStyle = true;
  legend.labels.pointStyle = "circle";
  legend.labels.boxWidth = 7;
  legend.labels.boxHeight = 7;
  legend.labels.padding = 16;
  legend.labels.font = { size: 12, weight: 600 };

  const tip = Chart.defaults.plugins.tooltip;
  tip.backgroundColor = themeColors().text;
  tip.titleColor = themeColors().card;
  tip.bodyColor = themeColors().card;
  tip.padding = 10;
  tip.cornerRadius = 10;
  tip.displayColors = true;
  tip.usePointStyle = true;
  tip.boxPadding = 4;
  tip.titleFont = { weight: 700, size: 12 };
  tip.bodyFont = { size: 12 };
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

/** Standard cartesian scales: hidden x grid, soft dashed y grid, no axis borders. */
export function baseScales(c: ThemeColors, yBeginAtZero = false): Record<string, Partial<ScaleOptionsByType<"linear" | "category">>> {
  return {
    x: {
      grid: { display: false },
      border: { display: false },
      ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 6, color: c.muted, font: { size: 11 } },
    } as never,
    y: {
      beginAtZero: yBeginAtZero,
      grid: { color: c.line },
      border: { display: false },
      ticks: { color: c.muted, font: { size: 11 }, maxTicksLimit: 6, padding: 6 },
    } as never,
  };
}
