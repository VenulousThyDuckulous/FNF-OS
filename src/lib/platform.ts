/** Device and install-state detection. Handles platform quirks honestly. */

export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
}

export function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 760px)').matches;
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ reports a desktop UA; detect touch + Mac platform instead.
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

export function isAndroid(): boolean {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
}

/**
 * Standalone check.
 *
 * We can reliably tell whether we are *already* running installed. We cannot
 * reliably tell whether the app is *installable*, so nothing in the UI claims
 * that; it only reacts to the real `beforeinstallprompt` event.
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

/**
 * Mobile users must install before library/playback, per the product spec.
 * Deliberately based on the actual platform rather than viewport width - a
 * narrow desktop window is not a phone and must not be gated.
 */
export function requiresInstall(): boolean {
  if (typeof window === 'undefined') return false;
  const mobile = isIOS() || isAndroid();
  return mobile && !isStandalone();
}

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let deferredPrompt: InstallPromptEvent | null = null;
const listeners = new Set<(available: boolean) => void>();

export function registerInstallPromptListener(): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const onPrompt = (event: Event) => {
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    listeners.forEach((listener) => listener(true));
  };
  const onInstalled = () => {
    deferredPrompt = null;
    listeners.forEach((listener) => listener(false));
  };

  window.addEventListener('beforeinstallprompt', onPrompt);
  window.addEventListener('appinstalled', onInstalled);

  return () => {
    window.removeEventListener('beforeinstallprompt', onPrompt);
    window.removeEventListener('appinstalled', onInstalled);
  };
}

export function onInstallAvailabilityChange(listener: (available: boolean) => void): () => void {
  listeners.add(listener);
  listener(Boolean(deferredPrompt));
  return () => listeners.delete(listener);
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable';
  await deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return choice.outcome;
}

export function preferredOrientation(): 'landscape' | 'portrait' {
  return isTouchDevice() ? 'landscape' : 'landscape';
}
