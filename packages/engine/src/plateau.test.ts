import { describe, it, expect } from "vitest";
import { assessPlateau } from "./plateau.js";

const baseline = {
  hasWeightGoal: true,
  goalReached: false,
  weeklyRateKg: -0.4,
  windowDays: 28,
  avgIntakeKcal: 2200,
  measuredTdee: 2600,
  tdeeSource: "data-driven",
};

describe("assessPlateau", () => {
  it("returns none without an active goal", () => {
    expect(assessPlateau({ ...baseline, hasWeightGoal: false }).status).toBe("none");
    expect(assessPlateau({ ...baseline, goalReached: true }).status).toBe("none");
  });

  it("needs at least two weeks of trend", () => {
    expect(assessPlateau({ ...baseline, weeklyRateKg: 0, windowDays: 7 }).status).toBe("insufficient_data");
    expect(assessPlateau({ ...baseline, weeklyRateKg: null, windowDays: null }).status).toBe("insufficient_data");
  });

  it("reports progressing when the trend is moving", () => {
    expect(assessPlateau({ ...baseline, weeklyRateKg: -0.4 }).status).toBe("progressing");
  });

  it("flags a plateau when the trend is flat, using measured TDEE as maintenance", () => {
    const a = assessPlateau({ ...baseline, weeklyRateKg: 0.03, measuredTdee: 2500, tdeeSource: "data-driven" });
    expect(a.status).toBe("plateau");
    expect(a.maintenanceKcal).toBe(2500);
  });

  it("falls back to average intake for maintenance when TDEE is only estimated", () => {
    const a = assessPlateau({ ...baseline, weeklyRateKg: -0.02, tdeeSource: "estimated", measuredTdee: 3000, avgIntakeKcal: 2100 });
    expect(a.status).toBe("plateau");
    expect(a.maintenanceKcal).toBe(2100);
  });
});
