import { describe, it, expect } from "vitest";
import { validatePayload } from "./validate.ts";

const TODAY = "2026-07-13";

describe("validatePayload", () => {
  it("rejects a body without an entries array", () => {
    const r = validatePayload({}, TODAY);
    expect(r.valid).toEqual([]);
    expect(r.rejections[0]?.field).toBe("entries");
  });

  it("accepts a full valid entry", () => {
    const r = validatePayload(
      {
        entries: [
          {
            date: "2026-07-12",
            weightKg: 74.2,
            bodyFat: 0.182,
            steps: 8450,
            nutrition: { calories: 2100, protein: 150, carbs: 190, fat: 70, fiber: 30 },
          },
        ],
      },
      TODAY,
    );
    expect(r.rejections).toEqual([]);
    expect(r.valid).toHaveLength(1);
    expect(r.valid[0]?.nutrition?.calories).toBe(2100);
  });

  it("accepts a partial entry (weight only)", () => {
    const r = validatePayload({ entries: [{ date: "2026-07-12", weightKg: 74 }] }, TODAY);
    expect(r.valid).toHaveLength(1);
    expect(r.valid[0]?.weightKg).toBe(74);
    expect(r.valid[0]?.steps).toBeUndefined();
  });

  it("rejects an entry missing the date (Req 4.1)", () => {
    const r = validatePayload({ entries: [{ weightKg: 74 }] }, TODAY);
    expect(r.valid).toEqual([]);
    expect(r.rejections[0]?.field).toBe("date");
  });

  it("rejects negative / non-numeric values (Req 4.2)", () => {
    const r = validatePayload(
      {
        entries: [
          { date: "2026-07-12", weightKg: -1 },
          { date: "2026-07-12", steps: "lots" },
        ],
      },
      TODAY,
    );
    expect(r.valid).toEqual([]);
    expect(r.rejections.map((x) => x.field)).toEqual(["weightKg", "steps"]);
  });

  it("rejects a body fat value above 100 (neither fraction nor percent)", () => {
    const r = validatePayload({ entries: [{ date: "2026-07-12", bodyFat: 150 }] }, TODAY);
    expect(r.valid).toEqual([]);
    expect(r.rejections[0]?.field).toBe("bodyFat");
  });

  it("rejects dates more than 1 day in the future (Req 4.3)", () => {
    const r = validatePayload({ entries: [{ date: "2026-07-20", weightKg: 74 }] }, TODAY);
    expect(r.valid).toEqual([]);
    expect(r.rejections[0]?.reason).toContain("future");
  });

  it("allows tomorrow (<= 1 day future) for timezone slack", () => {
    const r = validatePayload({ entries: [{ date: "2026-07-14", weightKg: 74 }] }, TODAY);
    expect(r.valid).toHaveLength(1);
  });

  it("stores valid entries while rejecting invalid ones in the same payload (Req 4.4)", () => {
    const r = validatePayload(
      {
        entries: [
          { date: "2026-07-10", weightKg: 74 }, // valid
          { weightKg: 75 }, // invalid: no date
          { date: "2026-07-11", nutrition: { calories: 2000 } }, // valid
        ],
      },
      TODAY,
    );
    expect(r.valid.map((e) => e.date)).toEqual(["2026-07-10", "2026-07-11"]);
    expect(r.rejections).toHaveLength(1);
    expect(r.rejections[0]?.index).toBe(1);
  });

  it("rejects an entry with invalid nutrition", () => {
    const r = validatePayload(
      { entries: [{ date: "2026-07-12", nutrition: { calories: 2000, protein: -5 } }] },
      TODAY,
    );
    expect(r.valid).toEqual([]);
    expect(r.rejections[0]?.field).toBe("nutrition.protein");
  });

  // --- Shortcuts-robustness cases ---

  it("coerces stringified numbers (Shortcuts sends numbers as strings)", () => {
    const r = validatePayload(
      { entries: [{ date: "2026-07-12", weightKg: "80.2", steps: "8450", nutrition: { calories: "2100", protein: "150" } }] },
      TODAY,
    );
    expect(r.rejections).toEqual([]);
    expect(r.valid[0]?.weightKg).toBe(80.2);
    expect(r.valid[0]?.steps).toBe(8450);
    expect(r.valid[0]?.nutrition?.calories).toBe(2100);
    expect(r.valid[0]?.nutrition?.protein).toBe(150);
  });

  it("skips blank fields instead of rejecting the entry (missed weigh-in keeps calories)", () => {
    const r = validatePayload(
      { entries: [{ date: "2026-07-12", weightKg: "", bodyFat: null, nutrition: { calories: 2000 } }] },
      TODAY,
    );
    expect(r.rejections).toEqual([]);
    expect(r.valid).toHaveLength(1);
    expect(r.valid[0]?.weightKg).toBeUndefined();
    expect(r.valid[0]?.nutrition?.calories).toBe(2000);
  });

  it("normalizes body fat given as a percentage to a fraction", () => {
    const r = validatePayload({ entries: [{ date: "2026-07-12", bodyFat: "18.2" }] }, TODAY);
    expect(r.rejections).toEqual([]);
    expect(r.valid[0]?.bodyFat).toBeCloseTo(0.182, 6);
  });

  it("keeps a body fat fraction as-is", () => {
    const r = validatePayload({ entries: [{ date: "2026-07-12", bodyFat: 0.182 }] }, TODAY);
    expect(r.valid[0]?.bodyFat).toBeCloseTo(0.182, 6);
  });

  it("skips nutrition entirely when calories are blank", () => {
    const r = validatePayload(
      { entries: [{ date: "2026-07-12", weightKg: 80, nutrition: { calories: "" } }] },
      TODAY,
    );
    expect(r.rejections).toEqual([]);
    expect(r.valid[0]?.weightKg).toBe(80);
    expect(r.valid[0]?.nutrition).toBeUndefined();
  });

  it("still rejects a genuinely invalid present value", () => {
    const r = validatePayload({ entries: [{ date: "2026-07-12", weightKg: "abc" }] }, TODAY);
    expect(r.valid).toEqual([]);
    expect(r.rejections[0]?.field).toBe("weightKg");
  });
});
