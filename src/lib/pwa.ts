/**
 * Service worker registration.
 *
 * The app shell and visited assets are cached; imported mods live in IndexedDB
 * and are therefore already local. The worker never caches API responses -
 * there are none - and never touches another origin.
 */

export interface PwaState {
  supported: boolean;
  registered: boolean;
  updateReady: boolean;
}

let waitingWorker: ServiceWorker | null = null;

export function registerServiceWorker(onUpdateReady?: () => void): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  if (import.meta.env.DEV) return; // dev builds are unhashed and change constantly

  const url = new URL('sw.js', document.baseURI);

  navigator.serviceWorker
    .register(url, { scope: new URL('./', document.baseURI).pathname })
    .then((registration) => {
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            waitingWorker = registration.waiting;
            onUpdateReady?.();
          }
        });
      });
    })
    .catch(() => {
      // Registration failure is non-fatal: the app still works online.
    });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    waitingWorker = null;
  });
}

export function applyUpdate(): void {
  waitingWorker?.postMessage({ type: 'SKIP_WAITING' });
  waitingWorker = null;
  window.location.reload();
}
