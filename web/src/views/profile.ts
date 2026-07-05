import { getProfile, updateProfile, getFullExport, type FullExport } from "@tdee/server";
import { ACTIVITY_PAL, type ActivityLevelKey, type Gender } from "@tdee/engine";
import { supabase } from "../supabase.js";
import { signOut } from "../auth.js";
import { el, localIsoToday } from "../util.js";

const client = () => supabase as never;

/** Trigger a browser download of a text blob. */
function downloadFile(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Merge all per-metric entries into one daily table and format as CSV. */
function toDailyCsv(x: FullExport): string {
  const byDate = new Map<string, Record<string, string | number>>();
  const ensure = (d: string) => {
    let row = byDate.get(d);
    if (!row) {
      row = { date: d };
      byDate.set(d, row);
    }
    return row;
  };
  for (const w of x.weight) ensure(w.entry_date).weight_kg = w.value_kg;
  for (const b of x.bodyFat) ensure(b.entry_date).body_fat_pct = Math.round(b.value_fraction * 1000) / 10;
  for (const s of x.steps) ensure(s.entry_date).steps = s.steps;
  for (const c of x.calories) {
    const row = ensure(c.entry_date);
    row.calories = c.calories;
    if (c.protein_g != null) row.protein_g = c.protein_g;
    if (c.carbs_g != null) row.carbs_g = c.carbs_g;
    if (c.fat_g != null) row.fat_g = c.fat_g;
    if (c.fiber_g != null) row.fiber_g = c.fiber_g;
  }
  const cols = ["date", "weight_kg", "body_fat_pct", "steps", "calories", "protein_g", "carbs_g", "fat_g", "fiber_g"];
  const dates = [...byDate.keys()].sort();
  const lines = [cols.join(",")];
  for (const d of dates) {
    const row = byDate.get(d)!;
    lines.push(cols.map((c) => (row[c] ?? "")).join(","));
  }
  return lines.join("\n");
}

function exportCard(): HTMLElement {
  const msg = el("p", { class: "muted", attrs: { style: "margin-top:8px;" } });
  const csvBtn = el("button", { class: "btn secondary", text: "Export daily data (CSV)" });
  const jsonBtn = el("button", { class: "btn secondary", attrs: { style: "margin-top:8px;" }, text: "Export full backup (JSON)" });

  const run = async (kind: "csv" | "json") => {
    msg.textContent = "Preparing…";
    try {
      const data = await getFullExport(client());
      const stamp = localIsoToday();
      if (kind === "csv") downloadFile(`tdee-daily-${stamp}.csv`, toDailyCsv(data), "text/csv");
      else downloadFile(`tdee-backup-${stamp}.json`, JSON.stringify(data, null, 2), "application/json");
      msg.textContent = "Done — check your downloads.";
    } catch (e) {
      msg.textContent = e instanceof Error ? `Export failed: ${e.message}` : "Export failed.";
    }
  };
  csvBtn.addEventListener("click", () => void run("csv"));
  jsonBtn.addEventListener("click", () => void run("json"));

  return el("div", { class: "card" }, [
    el("h2", { text: "Export & backup" }),
    el("p", { class: "muted", attrs: { style: "margin:0 0 12px;" }, text: "Download all your data. CSV opens in any spreadsheet; JSON is a complete backup." }),
    csvBtn,
    jsonBtn,
    msg,
  ]);
}

const ACTIVITY_LABELS: Record<ActivityLevelKey, string> = {
  sedentary: "Sedentary",
  light: "Lightly active",
  moderate: "Moderately active",
  active: "Very active",
  veryActive: "Extremely active",
};

export async function renderProfile(root: HTMLElement): Promise<void> {
  const p = await getProfile(client(), localIsoToday());

  const name = el("input", { attrs: { type: "text", placeholder: "Your name" } }) as HTMLInputElement;
  name.value = p.name ?? "";
  const dob = el("input", { attrs: { type: "date" } }) as HTMLInputElement;
  if (p.dateOfBirth) dob.value = p.dateOfBirth;
  const height = el("input", { attrs: { type: "number", step: "0.5", placeholder: "cm" } }) as HTMLInputElement;
  if (p.heightCm != null) height.value = String(p.heightCm);

  const gender = el("select") as HTMLSelectElement;
  for (const g of ["male", "female", "other"] as Gender[]) {
    gender.append(el("option", { text: g, attrs: { value: g } }));
  }
  if (p.gender) gender.value = p.gender;

  const activity = el("select") as HTMLSelectElement;
  for (const key of Object.keys(ACTIVITY_PAL) as ActivityLevelKey[]) {
    activity.append(el("option", { text: ACTIVITY_LABELS[key], attrs: { value: String(ACTIVITY_PAL[key]) } }));
  }
  activity.value = String(p.activityPal);

  const msg = el("p", { class: "ok" });
  const save = el("button", { class: "btn", text: "Save profile" });
  save.addEventListener("click", async () => {
    msg.textContent = "";
    msg.className = "ok";
    try {
      await updateProfile(client(), {
        name: name.value.trim() || null,
        dateOfBirth: dob.value || null,
        heightCm: height.value ? Number(height.value) : null,
        gender: gender.value as Gender,
        activityPal: Number(activity.value),
      });
      msg.textContent = "Saved.";
    } catch (e) {
      msg.className = "err";
      msg.textContent = e instanceof Error ? e.message : "Failed to save.";
    }
  });

  const logout = el("button", { class: "btn secondary", text: "Sign out" });
  logout.addEventListener("click", async () => {
    await signOut();
    location.reload();
  });

  const ageText = p.age != null ? `Age: ${p.age}` : "Age: — (set date of birth)";

  root.replaceChildren(
    el("div", { class: "readable" }, [
      el("div", { class: "card" }, [
        el("h2", { text: "Profile" }),
        el("label", { text: "Name" }, [name]),
        el("label", { text: "Date of birth" }, [dob]),
        el("p", { class: "muted", text: ageText }),
        el("label", { text: "Height (cm)" }, [height]),
        el("label", { text: "Gender" }, [gender]),
        el("label", { text: "Activity level" }, [activity]),
        save,
        msg,
      ]),
      exportCard(),
      el("div", { class: "card" }, [el("h2", { text: "Account" }), logout]),
    ]),
  );
}
