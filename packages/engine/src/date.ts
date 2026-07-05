import type { IsoDate } from "./types.js";

/**
 * Pure calendar-day arithmetic over ISO "YYYY-MM-DD" strings.
 *
 * Days are converted to an integer "epoch day" (days since 1970-01-01) via UTC so
 * the math is timezone-independent — an Entry_Date is a calendar day, not an instant.
 */

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse an ISO calendar day to an integer count of days since the Unix epoch. */
export function toEpochDay(iso: IsoDate): number {
  const m = ISO_RE.exec(iso);
  if (!m) throw new Error(`Invalid ISO date: "${iso}"`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const ms = Date.UTC(y, mo - 1, d);
  const dt = new Date(ms);
  // Reject non-existent dates (e.g. 2026-02-31 rolls over) to catch bad input.
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    throw new Error(`Invalid ISO date: "${iso}"`);
  }
  return Math.floor(ms / 86_400_000);
}

/** Convert an integer epoch day back to an ISO "YYYY-MM-DD" string. */
export function fromEpochDay(day: number): IsoDate {
  const dt = new Date(day * 86_400_000);
  const y = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

/** Return the ISO day `n` days after (or before, if negative) `iso`. */
export function addDays(iso: IsoDate, n: number): IsoDate {
  return fromEpochDay(toEpochDay(iso) + n);
}

/** Number of whole days from `a` to `b` (positive when `b` is later). */
export function diffDays(a: IsoDate, b: IsoDate): number {
  return toEpochDay(b) - toEpochDay(a);
}

/** Negative if a<b, 0 if equal, positive if a>b. */
export function compareDates(a: IsoDate, b: IsoDate): number {
  return toEpochDay(a) - toEpochDay(b);
}

/** Inclusive list of ISO days from `start` to `end`. Empty if start > end. */
export function enumerateDays(start: IsoDate, end: IsoDate): IsoDate[] {
  const s = toEpochDay(start);
  const e = toEpochDay(end);
  const out: IsoDate[] = [];
  for (let d = s; d <= e; d++) out.push(fromEpochDay(d));
  return out;
}

/** True if `date` is within [start, end] inclusive. */
export function isWithin(date: IsoDate, start: IsoDate, end: IsoDate): boolean {
  const d = toEpochDay(date);
  return d >= toEpochDay(start) && d <= toEpochDay(end);
}
