// Chessworkermind service worker
// Strategy: precache the hashed app shell (offline-assets.json) + icons on first
// install, cache-first for assets (so Stockfish WASM loads instantly after the
// first game), network-first for HTML navigation so new deploys are not stuck.
// Never destroys IndexedDB/localStorage saved games on update. Versioned cache name.

const CACHE = "cwm-v10-2026-10-04-b";
// Relative to wherever this worker is served from, so the same file works
// at a domain root and in a sub-folder.
const ROOT = new URL("./", self.location.href);
const at = (p) => new URL(p, ROOT).pathname;
const SHELL = [
  at("./"),
  at("manifest.webmanifest"),
  at("icons/icon-192.svg"),
  at("icons/icon-512.svg"),
  at("icons/icon-192-maskable.svg"),
  at("icons/icon-512-maskable.svg"),
  // Stockfish engine: precache so the computer opponent is instant and works offline.
  at("stockfish/stockfish-19-lite-single.js"),
  at("stockfish/stockfish-19-lite-single.wasm"),
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Shell first — if the offline manifest is missing (dev server) the app
      // still installs; the engine is what matters most for offline play.
      await cache.addAll(SHELL).catch(() => {});
      // Initial page assets load BEFORE this worker controls the page. Runtime
      // caching alone misses those first requests and leaves a blank offline app.
      try {
        const response = await fetch(at("offline-assets.json"), { cache: "no-store" });
        if (!response.ok) throw new Error("Offline asset manifest unavailable");
        const assets = await response.json();
        if (!Array.isArray(assets) || !assets.every((p) => typeof p === "string" && /^assets\/[A-Za-z0-9_.-]+$/.test(p))) {
          throw new Error("Invalid offline asset manifest");
        }
        await cache.addAll(assets.map(at));
      } catch {
        // Do not fail the whole install when only the manifest is unavailable.
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith("cwm-") && k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin GET
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // Navigations: network-first, fallback to cache, then to cached index
  if (req.mode === "navigate" || req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(async () =>
          (await caches.match(url.href)) ||
          (await caches.match(url.pathname)) ||
          (await caches.match(new URL(at("./"), self.location.origin).href)) ||
          (await caches.match(at("./"))) ||
          Response.error())
    );
    return;
  }

  // Vite hashed assets / stockfish / icons: cache-first
  const isAsset =
    url.pathname.startsWith(at("assets/")) ||
    url.pathname.startsWith(at("stockfish/")) ||
    url.pathname.startsWith(at("icons/")) ||
    url.pathname.startsWith(at("fonts/"));

  if (isAsset) {
    event.respondWith(
      caches.match(url.href).then((cached) => caches.match(url.pathname).then((cachedByPath) => {
        cached = cached || cachedByPath;
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        });
      }))
    );
    return;
  }

  // Default: network-first with cache fallback (e.g. manifest)
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(url.href).then((c) => c || Response.error()))
  );
});
