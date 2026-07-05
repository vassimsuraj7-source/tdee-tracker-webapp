/**
 * Weight outlier detection.
 *
 * A single mistyped or mis-synced weigh-in (e.g. 50 kg for an 82 kg person, or a
 * scale reading in lb) can badly distort the trend and TDEE. This flags entries
 * that sit implausibly far from their local neighbours, using a robust median so
 * normal day-to-day water fluctuation (±1–2 kg) never trips it.
 *
 * An entry is flagged only if it differs from the median of nearby entries by BOTH
 * an absolute margin (default 4 kg) AND a relative margin (default 6%) — requiring
 * both keeps it sensible across body sizes. Pure & deterministic.
 */
import type { DatedValue, IsoDate } from "./types.js";
import { toEpochDay } from "./date.js";

export interface WeightOutlier {
  readonly date: IsoDate;
  readonly value: number;
  /** Median of nearby entries (the "expected" weight). */
  readonly expected: number;
  /** Signed difference value − expected (kg). */
  readonly deltaKg: number;
}

export interface OutlierOptions {
  /** Neighbour window on each side, in days (default 10). */
  readonly windowDays?: number;
  /** Minimum absolute deviation to flag, kg (default 4). */
  readonly minAbsKg?: number;
  /** Minimum relative deviation to flag, fraction (default 0.06 = 6%). */
  readonly minPct?: number;
  /** Minimum neighbours required to judge an entry (default 3). */
  readonly minNeighbours?: number;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Return the flagged outliers in `series`, most recent first. */
export function detectWeightOutliers(series: DatedValue[], opts: OutlierOptions = {}): WeightOutlier[] {
  const windowDays = opts.windowDays ?? 10;
  const minAbsKg = opts.minAbsKg ?? 4;
  const minPct = opts.minPct ?? 0.06;
  const minNeighbours = opts.minNeighbours ?? 3;

  const points = series
    .filter((p) => Number.isFinite(p.value) && p.value > 0)
    .map((p) => ({ ...p, epoch: toEpochDay(p.date) }));

  const flagged: WeightOutlier[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const neighbours = points.filter((q, j) => j !== i && Math.abs(q.epoch - p.epoch) <= windowDays).map((q) => q.value);
    if (neighbours.length < minNeighbours) continue;
    const expected = median(neighbours);
    const delta = p.value - expected;
    if (Math.abs(delta) >= minAbsKg && Math.abs(delta) / expected >= minPct) {
      flagged.push({ date: p.date, value: p.value, expected, deltaKg: delta });
    }
  }
  return flagged.sort((a, b) => (a.date < b.date ? 1 : -1));
}
