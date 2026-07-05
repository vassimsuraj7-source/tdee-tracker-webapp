import { describe, it, expect } from "vitest";
import { projectGoal } from "./projection.js";

describe("projectGoal", () => {
  const today = "2026-07-05";

  it("marks the goal reached when already there", () => {
    const p = projectGoal({ currentTrendKg: 78.05, weeklyRateKg: -0.3, goalWeightKg: 78, goalDate: "2026-09-01", today });
    expect(p.status).toBe("reached");
  });

  it("flags a flat trend as stalled", () => {
    const p = projectGoal({ currentTrendKg: 82, weeklyRateKg: 0.0, goalWeightKg: 78, today });
    expect(p.status).toBe("stalled");
    expect(p.projectedDate).toBeNull();
  });

  it("flags moving away from the goal", () => {
    // Need to lose weight (goal below current) but gaining.
    const p = projectGoal({ currentTrendKg: 82, weeklyRateKg: +0.3, goalWeightKg: 78, today });
    expect(p.status).toBe("wrong_direction");
  });

  it("projects a date and compares to the target date", () => {
    // 82 -> 78 is -4 kg at -0.5 kg/wk = 8 weeks = 56 days -> 2026-08-30.
    const p = projectGoal({ currentTrendKg: 82, weeklyRateKg: -0.5, goalWeightKg: 78, goalDate: "2026-09-01", today });
    expect(p.weeksToGoal).toBeCloseTo(8, 5);
    expect(p.projectedDate).toBe("2026-08-30");
    // Projected 2 days before target -> within a week -> on_track.
    expect(p.status).toBe("on_track");
  });

  it("classifies ahead and behind", () => {
    const ahead = projectGoal({ currentTrendKg: 82, weeklyRateKg: -1.0, goalWeightKg: 78, goalDate: "2026-12-01", today });
    expect(ahead.status).toBe("ahead");
    const behind = projectGoal({ currentTrendKg: 82, weeklyRateKg: -0.15, goalWeightKg: 78, goalDate: "2026-08-01", today });
    expect(behind.status).toBe("behind");
  });

  it("returns 'projecting' when there is no target date", () => {
    const p = projectGoal({ currentTrendKg: 82, weeklyRateKg: -0.5, goalWeightKg: 78, today });
    expect(p.status).toBe("projecting");
    expect(p.projectedDate).not.toBeNull();
  });
});
