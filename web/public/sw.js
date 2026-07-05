// Minimal service worker for offline app-shell (Req 21.3).
// Strategy: cache-first for same-origin static assets (JS/CSS/HTML/icons) so the
// installed app opens offline. API calls to Supabase are always network (not cached
// here); the app separately renders the last dashboard from localStorage when offline.

const CACHE = "tdee-shell-v1";

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
  // Only cache our own origin's static assets; never cache cross-origin API (Supabase).
  if (url.origin !== self.location.origin) return;

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
