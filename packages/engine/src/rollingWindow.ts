import type { DatedValue, IsoDate } from "./types.js";
import { KCAL_PER_KG } from "./types.js";
import { addDays, enumerateDays, toEpochDay } from "./date.js";
import { fillMissingWeightData, trendWeight, TREND_WINDOW } from "./trendWeight.js";
import { mean } from "./util.js";

export const WINDOW_SIZE = 12;
export const MIN_VALID_DAYS = 7;

/** A rolling window, expressed as inclusive start/end calendar days. */
export interface Window {
  readonly start: IsoDate;
  readonly end: IsoDate;
}

/** A computed TDEE for one window, with the count of days that had logged calories. */
export interface WindowTdee {
  readonly window: Window;
  readonly tdee: number;
  readonly validDays: number;
}

/** Build a map of Valid_Calorie_Days (calories > 0) keyed by day. */
export function toValidCalorieMap(entries: readonly DatedValue[]): Map<IsoDate, number> {
  const map = new Map<IsoDate, number>();
  for (const e of entries) {
    if (e.value > 0) map.set(e.date, e.value);
  }
  return map;
}

/**
 * Find all rolling windows with at least `minValidDays` Valid_Calorie_Days,
 * scanning backward from `today` (Req 11.2). Windows are returned most-recent
 * first, so the first element is the current window. Port of the native
 * `findValidWindows`: stops once a window contains no valid days at all (Req 11.2).
 */
export function findValidWindows(
  caloriesByDay: Map<IsoDate, number>,
  today: IsoDate,
  windowSize: number = WINDOW_SIZE,
  minValidDays: number = MIN_VALID_DAYS,
): Window[] {
  if (caloriesByDay.size === 0) return [];
  const windows: Window[] = [];
  let end = today;
  // Safety floor: never scan more than one window past the earliest logged day.
  const earliest = Math.min(...[...caloriesByDay.keys()].map(toEpochDay));

  while (toEpochDay(end) >= earliest) {
    const start = addDays(end, -(windowSize - 1));
    const days = enumerateDays(start, end);
    const validCount = days.reduce((n, d) => n + (caloriesByDay.has(d) ? 1 : 0), 0);
    if (validCount === 0) break; // no data in this window; nothing older will qualify
    if (validCount >= minValidDays) windows.push({ start, end });
    end = addDays(end, -1);
  }
  return windows;
}

/**
 * Compute TDEE for one window (Req 11.4, 12): missing calorie days are imputed with
 * the window's valid-day average; weight change is the difference of Trend_Weight at
 * the window's end and start. Returns null when the window is not calculable.
 */
export function calculateWindowTdee(
  window: Window,
  caloriesByDay: Map<IsoDate, number>,
  filledWeights: readonly DatedValue[],
  windowSize: number = WINDOW_SIZE,
  minValidDays: number = MIN_VALID_DAYS,
): WindowTdee | null {
  const days = enumerateDays(window.start, window.end);
  const validCalories = days.filter((d) => caloriesByDay.has(d)).map((d) => caloriesByDay.get(d)!);
  if (validCalories.length < minValidDays) return null;

  const avg = mean(validCalories);
  const totalCalories = days.reduce((sum, d) => sum + (caloriesByDay.get(d) ?? avg), 0);

  const startTrend = trendWeight(filledWeights, window.start);
  const endTrend = trendWeight(filledWeights, window.end);
  if (startTrend === undefined || endTrend === undefined) return null;

  const weightChangeKg = endTrend - startTrend;
  const tdee = (totalCalories - weightChangeKg * KCAL_PER_KG) / windowSize;
  if (!Number.isFinite(tdee)) return null;

  return { window, tdee, validDays: validCalories.length };
}

/** Result of computing TDEE across all valid windows. */
export interface WindowTdeeSeries {
  /** Most recent calculable window's TDEE, or null if none. */
  readonly current: WindowTdee | null;
  /** All calculable windows, ascending by end date (for the history chart). */
  readonly history: WindowTdee[];
}

/**
 * End-to-end data-driven TDEE over stored history (Req 11-13, 15). Pure: `today`
 * is supplied by the caller. Builds filled weights once over the span needed for
 * trend weights (earliest window start minus the trend window), then computes each
 * window's TDEE.
 */
export function computeWindowTdees(
  weights: readonly DatedValue[],
  calorieEntries: readonly DatedValue[],
  today: IsoDate,
  windowSize: number = WINDOW_SIZE,
  minValidDays: number = MIN_VALID_DAYS,
): WindowTdeeSeries {
  const caloriesByDay = toValidCalorieMap(calorieEntries);
  const windows = findValidWindows(caloriesByDay, today, windowSize, minValidDays);
  if (windows.length === 0) return { current: null, history: [] };

  const earliestStart = windows.reduce(
    (min, w) => (toEpochDay(w.start) < toEpochDay(min) ? w.start : min),
    windows[0]!.start,
  );
  const fillFrom = addDays(earliestStart, -(TREND_WINDOW - 1));
  const filled = fillMissingWeightData(weights, fillFrom, today);

  const computed = windows
    .map((w) => calculateWindowTdee(w, caloriesByDay, filled, windowSize, minValidDays))
    .filter((r): r is WindowTdee => r !== null);

  // windows are most-recent-first, so the first computed entry is current.
  const current = computed[0] ?? null;
  const history = [...computed].sort((a, b) => toEpochDay(a.window.end) - toEpochDay(b.window.end));
  return { current, history };
}
