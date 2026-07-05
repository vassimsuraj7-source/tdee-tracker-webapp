import { describe, it, expect } from "vitest";
import { createRateLimiter } from "./rateLimit.js";

describe("createRateLimiter (Req 22.3)", () => {
  it("allows up to max attempts then throttles within the window", () => {
    const rl = createRateLimiter({ max: 3, windowMs: 1000 });
    const t = 10_000;
    expect(rl.check("ip1", t)).toBe(true);
    expect(rl.check("ip1", t + 1)).toBe(true);
    expect(rl.check("ip1", t + 2)).toBe(true);
    expect(rl.check("ip1", t + 3)).toBe(false); // 4th within window -> throttled
  });

  it("tracks keys independently", () => {
    const rl = createRateLimiter({ max: 1, windowMs: 1000 });
    expect(rl.check("a", 0)).toBe(true);
    expect(rl.check("b", 0)).toBe(true);
    expect(rl.check("a", 1)).toBe(false);
  });

  it("recovers after the window passes", () => {
    const rl = createRateLimiter({ max: 1, windowMs: 1000 });
    expect(rl.check("ip", 0)).toBe(true);
    expect(rl.check("ip", 500)).toBe(false);
    expect(rl.check("ip", 1500)).toBe(true); // window elapsed
  });
});
