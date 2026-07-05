// Simple fixed-window in-memory rate limiter (Req 22.3). Used by the login and
// ingestion HTTP layers to throttle repeated failures from a source. In-memory is
// sufficient for a single-user app on a single instance; a shared store would be
// needed for multi-instance deployments.

export interface RateLimitOptions {
  /** Max attempts allowed within the window. */
  readonly max: number;
  /** Window length in milliseconds. */
  readonly windowMs: number;
}

export interface RateLimiter {
  /** Returns true if the attempt is allowed, false if the source is throttled. */
  check(key: string, now?: number): boolean;
  /** Clear all counters (test helper). */
  reset(): void;
}

export function createRateLimiter(options: RateLimitOptions): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    check(key: string, now: number = Date.now()): boolean {
      const windowStart = now - options.windowMs;
      const recent = (hits.get(key) ?? []).filter((t) => t > windowStart);
      if (recent.length >= options.max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      return true;
    },
    reset() {
      hits.clear();
    },
  };
}
