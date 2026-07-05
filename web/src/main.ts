import "./styles.css";
import { hasSession, renderLogin } from "./auth.js";
import { renderDashboard } from "./views/dashboard.js";
import { renderGoals } from "./views/goals.js";
import { renderProfile } from "./views/profile.js";
import { el } from "./util.js";

type Tab = "dashboard" | "goals" | "settings";

const TABS: { id: Tab; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "goals", label: "Goals" },
  { id: "settings", label: "Settings" },
];

const root = document.getElementById("app")!;

function renderApp(): void {
  let current: Tab = "dashboard";
  const content = el("div", { class: "app" });
  const header = el("header", {}, [el("h1", { html: 'TDEE <span class="accent">Tracker</span>' })]);
  const view = el("div", {});
  content.append(header, view);

  const tabbar = el("nav", { class: "tabbar" });
  const buttons = new Map<Tab, HTMLButtonElement>();

  function show(tab: Tab): void {
    current = tab;
    for (const [id, b] of buttons) b.classList.toggle("active", id === tab);
    if (tab === "dashboard") renderDashboard(view);
    else if (tab === "goals") renderGoals(view);
    else void renderProfile(view);
  }

  for (const t of TABS) {
    const b = el("button", { text: t.label }) as HTMLButtonElement;
    b.addEventListener("click", () => show(t.id));
    buttons.set(t.id, b);
    tabbar.append(b);
  }

  root.replaceChildren(content, tabbar);
  show(current);
}

async function boot(): Promise<void> {
  if ("serviceWorker" in navigator) {
    // Relative to the app's base path so it works under a GitHub Pages subpath.
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  }
  if (await hasSession()) {
    renderApp();
  } else {
    renderLogin(root, renderApp);
  }
}

void boot();
