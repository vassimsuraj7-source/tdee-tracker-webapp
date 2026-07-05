import { defineConfig } from "vite";

export default defineConfig({
  // Relative base so the app works at any path (e.g. a GitHub Pages project subpath
  // like /tdee-tracker/) without hardcoding the repo name.
  base: "./",
  // @tdee/server references process.env inside functions the browser never calls;
  // neutralize the reference so bundling/runtime is clean in the browser.
  define: { "process.env": "{}" },
  build: {
    outDir: "dist",
    target: "es2022",
  },
});
