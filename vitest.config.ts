import { defineConfig } from "vitest/config";

/**
 * Root Vitest config for pure logic that lives outside the workspace packages —
 * currently the Edge Functions' shared modules (validation), which are framework-
 * agnostic TypeScript and therefore testable in Node even though the functions run
 * on Deno in production.
 */
export default defineConfig({
  test: {
    globals: true,
    include: ["supabase/functions/**/*.test.ts"],
  },
});
