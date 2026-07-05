// Service worker for offline app-shell (Req 21.3).
// Strategy:
//   - Navigations (HTML): network-first, so a fresh deploy's index.html (which points
//     at new hashed asset filenames) loads immediately when online; falls back to the
//     cached shell when offline.
//   - Hashed static assets (JS/CSS/icons): cache-first (their names change per build,
//     so cached copies are never stale).
//   - Cross-origin (Supabase API): never cached; the app renders the last dashboard
//     from localStorage when offline.

const CACHE = "tdee-shell-v3";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  // "./" resolves against the SW scope, so this works at root or a subpath.
  event.waitUntil(caches.open(CACHE).then((c) => c.add("./")));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Only handle our own origin's assets; never cache cross-origin API (Supabase).
  if (url.origin !== self.location.origin) return;

  const isNavigation = req.mode === "navigate" || req.destination === "document";

  if (isNavigation) {
    // Network-first for the app shell so new deploys load without a double reload.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("./", copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match("./"))),
    );
    return;
  }

  // Cache-first for hashed static assets (filenames change per build).
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => cached || caches.match("./"));
      return cached || network;
    }),
  );
});
