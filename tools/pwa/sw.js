/*
 * SpoolSync service worker template. `tools/pwa/service-worker.ts` fills in the version and the
 * precache list at build time and writes the result to `dist/sw.js`.
 *
 * Scope: same-origin GET requests for the site's own pages and static files, and nothing else.
 * Cross-origin requests (Spoolman, TigerTag, GitHub changelog, other APIs) are never intercepted,
 * so credentials and API responses never reach this cache, and neither does anything requested
 * with an Authorization header or answered with Set-Cookie or Cache-Control: no-store.
 *
 * Updates: a new worker installs in the background and waits. The page offers "Reload to update",
 * which sends SKIP_WAITING; nothing swaps under an open tab on its own.
 */
const VERSION = "__VERSION__";
const PRECACHE = /* __PRECACHE__ */ [];
const CACHE_PREFIX = "spoolsync-";
const CACHE = `${CACHE_PREFIX}${VERSION}`;
const OFFLINE_URL = "/offline";
/** How long a page request waits for the network before showing the saved copy. */
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // `reload` bypasses the HTTP cache, so a new version never precaches stale files.
      await Promise.all(
        PRECACHE.map(async (url) => {
          const response = await fetch(new Request(url, { cache: "reload" }));
          if (!response.ok) throw new Error(`Precache failed for ${url}: ${response.status}`);
          await cache.put(url, response);
        }),
      );
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

/**
 * Whether a response is safe to keep: a plain same-origin success that does not ask to stay
 * uncached.
 */
function cacheable(request, response) {
  if (!response || response.status !== 200) return false;
  if (response.type === "opaque" || response.type === "opaqueredirect") return false;
  if (request.headers.has("authorization")) return false;
  if (response.headers.has("set-cookie")) return false;
  const control = response.headers.get("cache-control") || "";
  return !/no-store|private/i.test(control);
}

async function put(request, response) {
  if (!cacheable(request, response)) return;
  const cache = await caches.open(CACHE);
  await cache.put(request, response.clone());
}

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

/** Pages: the network first so a deploy shows up at once, the saved copy when it cannot answer. */
async function page(request) {
  try {
    const response = await Promise.race([fetch(request), timeout(NETWORK_TIMEOUT_MS)]);
    // Only plain 200 answers are saved, so an error or 404 page never replaces a good copy.
    await put(request, response);
    return response;
  } catch {
    const cache = await caches.open(CACHE);
    const url = new URL(request.url);
    return (
      (await cache.match(request, { ignoreSearch: true })) ||
      (await cache.match(url.pathname.replace(/\/$/, "") || "/")) ||
      (await cache.match(OFFLINE_URL)) ||
      Response.error()
    );
  }
}

/** Hashed build files and fonts never change under the same name: saved copy first. */
async function immutable(request) {
  const cache = await caches.open(CACHE);
  const saved = await cache.match(request);
  if (saved) return saved;
  const response = await fetch(request);
  await put(request, response);
  return response;
}

/** Everything else on this site: the network first, the saved copy when offline. */
async function other(request) {
  try {
    const response = await fetch(request);
    await put(request, response);
    return response;
  } catch (error) {
    const saved = await (await caches.open(CACHE)).match(request);
    if (saved) return saved;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/sw.js" || url.pathname === "/manifest.webmanifest") return;
  // Reference-data snapshots are several MB each. The page keeps its own copy (IndexedDB), so a
  // second copy here would only use up space.
  if (url.pathname.startsWith("/reference/")) return;
  if (request.headers.has("range")) return;

  if (request.mode === "navigate") event.respondWith(page(request));
  else if (url.pathname.startsWith("/_astro/") || url.pathname.endsWith(".woff2"))
    event.respondWith(immutable(request));
  else event.respondWith(other(request));
});
