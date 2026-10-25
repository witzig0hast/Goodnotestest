// GoodShare service worker.
//
// By default it does nothing but make the site installable — note data is
// personal and should be fresh. Only when someone switches on "Favoriten
// offline verfügbar" (see src/lib/offline.ts) does it keep copies:
//
//   - FILES_CACHE: the favorite PDFs themselves, refreshed whenever the
//     list of favorites changes, served when the network is unreachable.
//   - SHELL_CACHE: the /dashboard page plus the scripts/styles it loads
//     and the pdf.js files, so the app (and its offline view) can start
//     from the home screen without a connection.
//
// Logging out or switching the option off deletes both caches.

const FILES_CACHE = "goodshare-offline-files-v1";
const SHELL_CACHE = "goodshare-offline-shell-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

async function offlineEnabled() {
  return caches.has(FILES_CACHE);
}

async function cacheShell(assets) {
  const shell = await caches.open(SHELL_CACHE);
  try {
    const page = await fetch("/dashboard", { credentials: "include" });
    if (page.ok) await shell.put("/dashboard", page);
  } catch {
    // offline right now — keep the copy we have
  }
  for (const asset of assets) {
    if (await shell.match(asset)) continue;
    try {
      const response = await fetch(asset);
      if (response.ok) await shell.put(asset, response);
    } catch {
      // skip
    }
  }
}

async function syncFiles(urls, assets) {
  const cache = await caches.open(FILES_CACHE);
  await cacheShell(assets || []);
  const wanted = new Set(urls);
  for (const request of await cache.keys()) {
    if (!wanted.has(request.url)) await cache.delete(request);
  }
  let stored = 0;
  for (const url of urls) {
    try {
      const response = await fetch(url, { credentials: "include", mode: "cors" });
      if (response.ok) {
        await cache.put(url, response);
        stored++;
      }
    } catch {
      // offline right now — keep whatever copy we had
      if (await cache.match(url)) stored++;
    }
  }
  return stored;
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  const reply = (msg) => event.source && event.source.postMessage(msg);
  if (data.type === "offline-sync") {
    enabled = true;
    event.waitUntil(
      syncFiles(data.urls || [], data.assets).then((stored) => reply({ type: "offline-synced", stored }))
    );
  } else if (data.type === "offline-clear") {
    enabled = false;
    event.waitUntil(
      Promise.all([caches.delete(FILES_CACHE), caches.delete(SHELL_CACHE)]).then(() =>
        reply({ type: "offline-cleared" })
      )
    );
  }
});

// Network first; on success refresh the cached copy, on failure serve it.
async function networkFirst(request, cacheName, cacheKey) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok && (await offlineEnabled())) cache.put(cacheKey || request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(cacheKey || request);
    if (cached) return cached;
    throw err;
  }
}

// Remembered in memory so ordinary requests aren't intercepted at all
// while offline mode is off; refreshed from the cache on every wake-up.
let enabled = false;
caches.has(FILES_CACHE).then((v) => (enabled = v));

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  // The dashboard navigation is always checked against the real cache
  // state: when the app is launched offline from the home screen, this is
  // the very first request after the worker wakes up, before `enabled`
  // has been read back.
  if (sameOrigin && request.mode === "navigate" && url.pathname === "/dashboard") {
    event.respondWith(
      offlineEnabled().then((on) =>
        // Always the same key: the offline view doesn't depend on ?path=.
        on ? networkFirst(request, SHELL_CACHE, "/dashboard") : fetch(request)
      )
    );
    return;
  }

  if (!enabled) return;

  if (sameOrigin && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/pdfjs/") || url.pathname.startsWith("/icons/"))) {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }

  // Favorite PDFs (requests to the API's download endpoint).
  event.respondWith(
    caches.open(FILES_CACHE).then(async (cache) =>
      (await cache.match(request.url)) ? networkFirst(request, FILES_CACHE, request.url) : fetch(request)
    )
  );
});
