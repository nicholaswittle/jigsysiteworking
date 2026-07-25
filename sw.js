/* Jigsy's staff console service worker — offline shell only. */
const CACHE = "jigsys-staff-v1";
const SHELL = [
  "staff-demo.html",
  "demo.css?v=20260724-square",
  "demo-data.js",
  "api-client.js",
  "staff-demo.js",
  "images/icon-192.png",
  "images/icon-512.png",
  "images/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never cache live data — orders, settings, sessions and Square must always hit the network.
  if (url.pathname.startsWith("/api/")) return;

  // Navigations: network-first so staff always get the latest shell, cache only as offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("staff-demo.html")));
    return;
  }

  // Static assets: serve from cache, refresh in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
