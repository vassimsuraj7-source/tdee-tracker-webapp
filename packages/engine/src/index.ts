/**
 * @tdee/engine — pure TDEE calculation library.
 *
 * Ported from the native TDEETracker app. No I/O: every function operates on plain
 * data with dates passed in explicitly, so the same code runs in a Supabase Edge
 * Function and in unit tests unchanged.
 */

export * from "./types.js";
export * from "./date.js";
export * from "./trendWeight.js";
export * from "./rollingWindow.js";
export * from "./bmr.js";
export * from "./guardrails.js";
export * from "./calorieTarget.js";
export * from "./macros.js";
export * from "./formulas.js";
export * from "./projection.js";
export * from "./outliers.js";
export * from "./plateau.js";

export const ENGINE_VERSION = "0.1.0";
