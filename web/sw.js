/**
 * Service worker: what makes the app work with no network at all.
 *
 * This is the piece that turns a website into something a child can use on a
 * tablet in the car, at a grandparent's house with no wifi password, or in a
 * classroom whose connection has fallen over. After one visit every game is on
 * the device.
 *
 * Strategy, deliberately simple:
 *   - install: precache the whole app (it is small, and a half-cached app that
 *     works for four games and 404s on the fifth is worse than none);
 *   - fetch: cache-first for our own files, because they are versioned by
 *     BUILD_ID and therefore never stale within a version;
 *   - activate: delete every cache that is not this version, then take over.
 *
 * BUILD_ID is rewritten at deploy time by .github/workflows/deploy-pages.yml
 * with the commit SHA. That is what makes an update actually reach a child who
 * installed the app three weeks ago: a new SHA means a new cache name, which
 * means a full re-fetch on the next visit.
 */
const BUILD_ID = "v2-__BUILD_ID__";
const CACHE = `kmg-${BUILD_ID}`;

const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/app.css",

  "./js/main.js",
  "./js/shell.js",
  "./js/router.js",
  "./js/nav.js",
  "./js/dom.js",
  "./js/markdown.js",
  "./js/i18n.js",
  "./js/i18n-data.js",
  "./js/state.js",
  "./js/badges.js",
  "./js/rewards.js",
  "./js/log.js",
  "./js/sound.js",
  "./js/fx.js",
  "./js/illustrations.js",
  "./js/rng.js",
  "./js/visuals.js",
  "./js/charts.js",
  "./js/ui.js",
  "./js/ui-bits.js",
  "./js/gameflow.js",

  "./js/games/common.js",
  "./js/games/tafel.js",
  "./js/games/breuken.js",
  "./js/games/meten.js",
  "./js/games/procenten.js",
  "./js/games/algebra.js",
  "./js/games/meetkunde.js",
  "./js/games/verhoudingen.js",
  "./js/games/getallen.js",
  "./js/games/bliksem.js",
  "./js/games/jacht.js",
  "./js/games/logica.js",
  "./js/games/code.js",

  "./js/pages/home.js",
  "./js/pages/voortgang.js",
  "./js/pages/competitie.js",
  "./js/competition-logic.js",
  "./js/pages/uitleg.js",
  "./js/pages/dashboard.js",
  "./js/pages/rewards.js",

  "./icons/icon.svg",
  "./icons/icon-maskable.svg",
  "./icons/icon-256.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // addAll is all-or-nothing, which is what we want: a precache that
      // silently dropped one game would fail only later, offline, mid-lesson.
      await cache.addAll(PRECACHE);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(request, { ignoreSearch: true });
      if (cached) return cached;

      try {
        const response = await fetch(request);
        // Cache anything new we fetched successfully, so a file that was added
        // after this version's precache list still works offline next time.
        if (response.ok && response.type === "basic") {
          const cache = await caches.open(CACHE);
          cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        // Offline and not in the cache. For a navigation that is almost always
        // a deep link into the app, and index.html can render it - the route
        // lives in the hash, which never reaches the server anyway.
        if (request.mode === "navigate") {
          const shell = await caches.match("./index.html");
          if (shell) return shell;
        }
        throw error;
      }
    })(),
  );
});

// Lets the page ask a waiting worker to take over immediately (see main.js).
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});
