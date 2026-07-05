import { describe, it, expect } from "vitest";
import { ENGINE_VERSION, ACTIVITY_PAL, KCAL_PER_KG, CALORIE_TARGET_FLOOR } from "./index.js";

/**
 * Smoke test: verifies the toolchain (TypeScript + Vitest) is wired correctly.
 * Real calculation tests arrive with task 3.
 */
describe("engine scaffold", () => {
  it("exposes a version", () => {
    expect(ENGINE_VERSION).toBe("0.1.0");
  });

  it("carries the ported domain constants", () => {
    expect(ACTIVITY_PAL.moderate).toBe(1.55);
    expect(KCAL_PER_KG).toBe(7700);
    expect(CALORIE_TARGET_FLOOR).toBe(1200);
  });
});
