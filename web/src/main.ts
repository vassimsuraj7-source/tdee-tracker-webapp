import "./styles.css";
import { hasSession, renderLogin } from "./auth.js";
import { renderDashboard } from "./views/dashboard.js";
import { renderGoals } from "./views/goals.js";
import { renderProfile } from "./views/profile.js";
import { el } from "./util.js";

type Tab = "dashboard" | "goals" | "settings";

const ICONS: Record<Tab, string> = {
  dashboard:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13h8V3H3zM13 21h8V3h-8zM3 21h8v-6H3z"/></svg>',
  goals:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/></svg>',
  settings:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.2A1.6 1.6 0 0 0 6.7 19l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1-2.7H3a2 2 0 1 1 0-4h.2A1.6 1.6 0 0 0 5 6.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H10a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V10a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4.9z"/></svg>',
};

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
    const b = el("button", { html: `${ICONS[t.id]}<span>${t.label}</span>` }) as HTMLButtonElement;
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
