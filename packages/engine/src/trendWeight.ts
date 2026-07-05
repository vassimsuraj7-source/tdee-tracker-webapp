import type { DatedValue, IsoDate } from "./types.js";
import { addDays, diffDays, enumerateDays, isWithin, toEpochDay } from "./date.js";
import { mean } from "./util.js";

/** Default trend-weight window size (7-day simple moving average). */
export const TREND_WINDOW = 7;

/**
 * Fill every calendar day in [from, to] with a weight value, imputing gaps.
 * Port of the native `fillMissingWeightData`, expressed per Requirement 13:
 *  - recorded day: use the recorded value
 *  - gap with a known value on both sides: linear interpolation (Req 13.2)
 *  - gap with a known value on only one side: carry the single nearest value (Req 13.3)
 *
 * Neighbours are searched across the entire `raw` history, not just the range,
 * so days before the first / after the last recorded weight are carried from the
 * nearest end. Returns one entry per day, ascending; empty if `raw` is empty.
 */
export function fillMissingWeightData(
  raw: readonly DatedValue[],
  from: IsoDate,
  to: IsoDate,
): DatedValue[] {
  if (raw.length === 0) return [];

  // One value per day (last occurrence wins), then a sorted list of known days.
  const byDate = new Map<IsoDate, number>();
  for (const e of raw) byDate.set(e.date, e.value);
  const known = [...byDate.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => toEpochDay(a.date) - toEpochDay(b.date));

  const result: DatedValue[] = [];
  for (const day of enumerateDays(from, to)) {
    const existing = byDate.get(day);
    if (existing !== undefined) {
      result.push({ date: day, value: existing });
      continue;
    }

    const dayEpoch = toEpochDay(day);
    let earlier: DatedValue | undefined;
    for (let i = known.length - 1; i >= 0; i--) {
      const k = known[i]!;
      if (toEpochDay(k.date) < dayEpoch) {
        earlier = k;
        break;
      }
    }
    let later: DatedValue | undefined;
    for (let i = 0; i < known.length; i++) {
      const k = known[i]!;
      if (toEpochDay(k.date) > dayEpoch) {
        later = k;
        break;
      }
    }

    if (earlier && later) {
      const span = diffDays(earlier.date, later.date);
      const offset = diffDays(earlier.date, day);
      const value = earlier.value + ((later.value - earlier.value) * offset) / span;
      result.push({ date: day, value });
    } else if (earlier) {
      result.push({ date: day, value: earlier.value });
    } else if (later) {
      result.push({ date: day, value: later.value });
    }
    // If neither exists `known` was empty — impossible here since raw is non-empty.
  }
  return result;
}

/**
 * 7-day simple moving average of weight ending on and including `date`, computed
 * over already-filled daily values (Req 13.1). Returns undefined when fewer than
 * `window` daily values are available to cover the window (Req 13.4).
 */
export function trendWeight(
  filled: readonly DatedValue[],
  date: IsoDate,
  window: number = TREND_WINDOW,
): number | undefined {
  const start = addDays(date, -(window - 1));
  const values = filled.filter((e) => isWithin(e.date, start, date)).map((e) => e.value);
  if (values.length < window) return undefined;
  return mean(values);
}

/**
 * Display-oriented trend for charts: like `trendWeight`, but averages whatever daily
 * values exist in the window as long as at least `minDays` are present (an expanding
 * window at the start of history). This lets a chart show a trend line from near the
 * very first weigh-in — closer to how adaptive-smoothing apps present it — instead of
 * waiting for a full 7-day window.
 *
 * Deliberately NOT used by the TDEE engine, which requires the stable full-window
 * average (`trendWeight`) so the energy-balance math and native-app continuity hold.
 */
export function trendWeightPartial(
  filled: readonly DatedValue[],
  date: IsoDate,
  window: number = TREND_WINDOW,
  minDays = 2,
): number | undefined {
  const start = addDays(date, -(window - 1));
  const values = filled.filter((e) => isWithin(e.date, start, date)).map((e) => e.value);
  if (values.length < minDays) return undefined;
  return mean(values);
}

/**
 * Convenience: fill the range needed for a single date's trend and compute it.
 * Neighbours are still drawn from the full `raw` history.
 */
export function computeTrendWeight(
  raw: readonly DatedValue[],
  date: IsoDate,
  window: number = TREND_WINDOW,
): number | undefined {
  const filled = fillMissingWeightData(raw, addDays(date, -(window - 1)), date);
  return trendWeight(filled, date, window);
}
