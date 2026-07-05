import { getProfile, updateProfile } from "@tdee/server";
import { ACTIVITY_PAL, type ActivityLevelKey, type Gender } from "@tdee/engine";
import { supabase } from "../supabase.js";
import { signOut } from "../auth.js";
import { el, localIsoToday } from "../util.js";

const client = () => supabase as never;

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
    el("div", {}, [
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
      el("div", { class: "card" }, [el("h2", { text: "Account" }), logout]),
    ]),
  );
}
