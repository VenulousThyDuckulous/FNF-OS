/*
 * FNF OS service worker.
 *
 * Scope: the app shell and same-origin static assets. Imported mods live in
 * IndexedDB, so they are already local and are not handled here. Cross-origin
 * requests (runtime downloads, upstream links) are never cached or intercepted.
 */

const VERSION = 'fnf-os-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icons/icon-192.png'];

const scopeUrl = new URL(self.registration.scope);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => undefined),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network first, fall back to the cached shell so deep links
  // still boot offline (the hash router resolves from there).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches
            .open(VERSION)
            .then((cache) => cache.put(request, copy))
            .catch(() => undefined);
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(VERSION);
          return (await cache.match(request)) || (await cache.match(new URL('./index.html', scopeUrl)));
        }),
    );
    return;
  }

  // Assets: serve cached immediately, refresh in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches
              .open(VERSION)
              .then((cache) => cache.put(request, copy))
              .catch(() => undefined);
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
