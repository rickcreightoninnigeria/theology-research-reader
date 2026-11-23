// Web build only: service worker registration, the request for durable storage, and the Add to Home Screen hint for iPhone.
// Everything is wrapped so a missing or refused feature never stops the app.

/** Registers the service worker. Returns a short status string for the diagnostics page. */
export async function registerServiceWorker({ navigator: nav = globalThis.navigator, base = './' } = {}) {
  if (!nav?.serviceWorker) return 'not supported';
  try {
    const registration = await nav.serviceWorker.register(`${base}sw.js`, { scope: base });
    return registration.active
      ? 'active'
      : registration.installing
        ? 'installing'
        : registration.waiting
          ? 'waiting'
          : 'registered';
  } catch (error) {
    return `failed: ${error.message}`;
  }
}

/** Asks the browser to keep the storage (so it is not cleared under pressure). Returns true, false or null when unknown. */
export async function requestDurableStorage(nav = globalThis.navigator) {
  try {
    if (!nav?.storage?.persist) return null;
    if (await nav.storage.persisted?.()) return true;
    return await nav.storage.persist();
  } catch {
    return null;
  }
}

/** True on an iPhone or iPad in a browser (not yet added to the Home Screen), where the install hint helps. */
export function needsHomeScreenHint({
  navigator: nav = globalThis.navigator,
  matchMedia = globalThis.matchMedia?.bind(globalThis),
} = {}) {
  const ua = nav?.userAgent ?? '';
  const ios = /iPhone|iPad|iPod/.test(ua) || (nav?.platform === 'MacIntel' && nav?.maxTouchPoints > 1);
  const standalone = nav?.standalone === true || matchMedia?.('(display-mode: standalone)')?.matches === true;
  return ios && !standalone;
}
