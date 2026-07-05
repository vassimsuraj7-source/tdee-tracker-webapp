import { addDays } from "@tdee/engine";

/** The four trackable metrics exposed by the Webapp API. */
export type Metric = "weight" | "bodyfat" | "steps" | "calories";

/** Table + value column for the single-value metrics (calories is handled specially). */
export const SINGLE_VALUE_METRICS: Record<
  Exclude<Metric, "calories">,
  { table: string; valueCol: string }
> = {
  weight: { table: "weight_entries", valueCol: "value_kg" },
  bodyfat: { table: "body_fat_entries", valueCol: "value_fraction" },
  steps: { table: "step_entries", valueCol: "steps" },
};

/** User-selectable time range for detail views (Req 18.5). */
export type TimeRange = "7d" | "30d" | "90d" | "all";

/** Inclusive start day for a range relative to `today`, or null for "all". */
export function rangeStartIso(range: TimeRange, today: string): string | null {
  switch (range) {
    case "7d":
      return addDays(today, -6);
    case "30d":
      return addDays(today, -29);
    case "90d":
      return addDays(today, -89);
    case "all":
      return null;
  }
}
