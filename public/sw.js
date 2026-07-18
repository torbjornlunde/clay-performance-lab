const CACHE_PREFIX = "cpl-pwa-";
const CACHE_VERSION = "v1";
const STATIC_CACHE = `${CACHE_PREFIX}${CACHE_VERSION}-static`;
const REQUIRED_STATIC_ASSETS = ["/offline.html"];
const OPTIONAL_STATIC_ASSETS = [
  "/pwa-icons/192",
  "/pwa-icons/512",
  "/pwa-icons/maskable",
  "/pwa-icons/apple",
];
const STATIC_ASSETS = [...REQUIRED_STATIC_ASSETS, ...OPTIONAL_STATIC_ASSETS];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      await cache.addAll(REQUIRED_STATIC_ASSETS);
      await Promise.allSettled(OPTIONAL_STATIC_ASSETS.map((asset) => cache.add(asset)));
    }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== STATIC_CACHE)
      .map((key) => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

function isUnsafeToCache(url) {
  return url.pathname.startsWith("/api/") || url.hostname.includes("supabase.co") || url.hostname.includes("supabase.in");
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || isUnsafeToCache(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
    return;
  }

  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
  }
});
