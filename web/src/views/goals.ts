import {
  listGoals,
  setMainGoal,
  deleteMainGoal,
  addSubgoal,
  completeSubgoal,
  deleteSubgoal,
  MAIN_GOAL_ORDER,
  type GoalType,
  type GoalRow,
} from "@tdee/server";
import { supabase } from "../supabase.js";
import { el, fmt } from "../util.js";

const client = () => supabase as never;

const METRIC_LABELS: Record<GoalType, string> = {
  weight: "Weight (kg)",
  body_fat: "Body fat (fraction)",
  steps: "Steps",
};

function goalForm(
  title: string,
  onSubmit: (targetValue: number, goalDate: string | null) => Promise<void>,
): HTMLElement {
  const target = el("input", { attrs: { type: "number", step: "0.1", placeholder: "Target value" } });
  const date = el("input", { attrs: { type: "date" } });
  const msg = el("p", { class: "err" });
  const btn = el("button", { class: "btn small", text: title });
  btn.addEventListener("click", async () => {
    msg.textContent = "";
    const value = Number(target.value);
    if (!Number.isFinite(value) || value < 0) {
      msg.textContent = "Enter a valid non-negative target.";
      return;
    }
    try {
      await onSubmit(value, date.value || null);
      target.value = "";
      date.value = "";
    } catch (e) {
      msg.textContent = e instanceof Error ? e.message : "Failed to save.";
    }
  });
  return el("div", {}, [
    el("div", { class: "row2" }, [
      el("label", { text: "Target" }, [target]),
      el("label", { text: "Target date" }, [date]),
    ]),
    btn,
    msg,
  ]);
}

async function load(container: HTMLElement, metric: GoalType): Promise<void> {
  const goals = await listGoals(client(), metric);
  const main = goals.find((g) => g.order_index === MAIN_GOAL_ORDER) ?? null;
  const subgoals = goals.filter((g) => g.order_index > 0);

  const mainSection = el("div", { class: "card" }, [
    el("h2", { text: "Main goal" }),
    main
      ? el("div", {}, [
          el("div", { class: "metric" }, [
            el("div", { class: "value", text: fmt(main.target_value, 1) }),
            el("div", { class: "label", text: main.goal_date ?? "no date" }),
          ]),
          (() => {
            const del = el("button", { class: "btn danger small", text: "Remove main goal" });
            del.addEventListener("click", async () => {
              await deleteMainGoal(client(), metric);
              await load(container, metric);
            });
            return del;
          })(),
        ])
      : el("p", { class: "muted", text: "No main goal set." }),
    el("h2", { text: main ? "Replace main goal" : "Set main goal" }),
    goalForm(main ? "Replace" : "Set main goal", async (v, dt) => {
      await setMainGoal(client(), metric, { targetValue: v, goalDate: dt });
      await load(container, metric);
    }),
  ]);

  const subItems = subgoals.map((g: GoalRow) => {
    const complete = el("button", { class: "btn secondary small", text: g.is_completed ? "✓ done" : "Complete" });
    if (g.is_completed) complete.setAttribute("disabled", "true");
    complete.addEventListener("click", async () => {
      await completeSubgoal(client(), g.id);
      await load(container, metric);
    });
    const del = el("button", { class: "btn danger small", text: "Delete" });
    del.addEventListener("click", async () => {
      await deleteSubgoal(client(), g.id);
      await load(container, metric);
    });
    return el("div", { class: "list-item" }, [
      el("span", { text: `#${g.order_index}  →  ${fmt(g.target_value, 1)}${g.goal_date ? "  by " + g.goal_date : ""}` }),
      el("span", {}, [complete, el("span", { text: " " }), del]),
    ]);
  });

  const subSection = el("div", { class: "card" }, [
    el("h2", { text: "Milestone subgoals" }),
    ...(subItems.length ? subItems : [el("p", { class: "muted", text: "No subgoals yet." })]),
    el("h2", { text: "Add subgoal" }),
    goalForm("Add subgoal", async (v, dt) => {
      await addSubgoal(client(), metric, { targetValue: v, goalDate: dt });
      await load(container, metric);
    }),
  ]);

  container.replaceChildren(mainSection, subSection);
}

export function renderGoals(root: HTMLElement): void {
  const select = el("select") as HTMLSelectElement;
  for (const m of Object.keys(METRIC_LABELS) as GoalType[]) {
    select.append(el("option", { text: METRIC_LABELS[m], attrs: { value: m } }));
  }
  const container = el("div", {});
  select.addEventListener("change", () => void load(container, select.value as GoalType));

  root.replaceChildren(
    el("div", {}, [el("label", { text: "Metric" }, [select]), container]),
  );
  void load(container, "weight");
}
