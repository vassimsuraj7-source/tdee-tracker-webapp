import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    // Integration tests hit the live Supabase project over the network.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // These tests mutate a single shared database (and its singletons), so they
    // must run one file at a time — never in parallel workers.
    fileParallelism: false,
  },
});
