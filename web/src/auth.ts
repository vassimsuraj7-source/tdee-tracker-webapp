import { supabase } from "./supabase.js";
import { el } from "./util.js";

/** Whether a session currently exists. */
export async function hasSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return !!data.session;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/** Render the login screen; calls onSuccess once signed in (Req 20.2, 20.3). */
export function renderLogin(root: HTMLElement, onSuccess: () => void): void {
  const email = el("input", { attrs: { type: "email", placeholder: "you@example.com", autocomplete: "username" } });
  const password = el("input", { attrs: { type: "password", placeholder: "Password", autocomplete: "current-password" } });
  const error = el("p", { class: "err" });
  const button = el("button", { class: "btn", text: "Sign in" });

  async function submit() {
    error.textContent = "";
    button.setAttribute("disabled", "true");
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.value.trim(),
      password: password.value,
    });
    button.removeAttribute("disabled");
    if (err) {
      // Do not reveal which field was wrong (Req 20.3).
      error.textContent = "Invalid email or password.";
      return;
    }
    onSuccess();
  }

  button.addEventListener("click", submit);
  password.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") submit();
  });

  root.replaceChildren(
    el("div", { class: "app center" }, [
      el("div", { class: "card" }, [
        el("h1", { html: 'TDEE <span class="accent">Tracker</span>' }),
        el("p", { class: "muted", text: "Sign in to view your dashboard." }),
        el("label", { text: "Email" }, [email]),
        el("label", { text: "Password" }, [password]),
        button,
        error,
      ]),
    ]),
  );
}
