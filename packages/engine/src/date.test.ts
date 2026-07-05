import { describe, it, expect } from "vitest";
import {
  toEpochDay,
  fromEpochDay,
  addDays,
  diffDays,
  compareDates,
  enumerateDays,
  isWithin,
} from "./date.js";

describe("date utilities", () => {
  it("round-trips epoch day conversion", () => {
    expect(fromEpochDay(toEpochDay("2026-07-04"))).toBe("2026-07-04");
    expect(toEpochDay("1970-01-01")).toBe(0);
  });

  it("adds and subtracts days across month/year boundaries", () => {
    expect(addDays("2026-07-04", 1)).toBe("2026-07-05");
    expect(addDays("2026-07-01", -1)).toBe("2026-06-30");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29"); // leap year
  });

  it("computes signed day differences", () => {
    expect(diffDays("2026-07-01", "2026-07-13")).toBe(12);
    expect(diffDays("2026-07-13", "2026-07-01")).toBe(-12);
    expect(diffDays("2026-07-04", "2026-07-04")).toBe(0);
  });

  it("compares dates", () => {
    expect(compareDates("2026-07-01", "2026-07-02")).toBeLessThan(0);
    expect(compareDates("2026-07-02", "2026-07-01")).toBeGreaterThan(0);
    expect(compareDates("2026-07-01", "2026-07-01")).toBe(0);
  });

  it("enumerates inclusive day ranges", () => {
    expect(enumerateDays("2026-07-01", "2026-07-03")).toEqual([
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
    ]);
    expect(enumerateDays("2026-07-03", "2026-07-01")).toEqual([]);
  });

  it("tests inclusive membership", () => {
    expect(isWithin("2026-07-02", "2026-07-01", "2026-07-03")).toBe(true);
    expect(isWithin("2026-07-01", "2026-07-01", "2026-07-03")).toBe(true);
    expect(isWithin("2026-07-04", "2026-07-01", "2026-07-03")).toBe(false);
  });

  it("rejects malformed and non-existent dates", () => {
    expect(() => toEpochDay("2026-7-4")).toThrow();
    expect(() => toEpochDay("not-a-date")).toThrow();
    expect(() => toEpochDay("2026-02-31")).toThrow();
  });
});
