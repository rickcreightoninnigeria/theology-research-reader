// Web build only: service worker registration, the request for durable storage, and the Add to Home Screen hint for iPhone.
// Everything is wrapped so a missing or refused feature never stops the app.

/** True when the app is open on the reader's own computer (the only place a waiting build may be taken over at once). */
export const isOwnComputer = (hostname = globalThis.location?.hostname) =>
  ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname);

/**
 * On the reader's own computer, tells `onReady` when a newer build of the app has been downloaded and is waiting, and checks for one whenever
 * the window is brought back to the front. Returns { reload } which makes the waiting build take over and reloads the page. Elsewhere it
 * does nothing, and a new build waits until every window has closed.
 */
export function watchForNewBuild(
  registration,
  {
    navigator: nav = globalThis.navigator,
    hostname,
    onReady,
    reloadPage = () => globalThis.location.reload(),
    doc = globalThis.document,
  } = {},
) {
  if (!registration || !isOwnComputer(hostname) || !nav?.serviceWorker) return { reload() {} };
  let waiting = registration.waiting && nav.serviceWorker.controller ? registration.waiting : null;
  if (waiting) onReady?.();
  registration.addEventListener?.('updatefound', () => {
    const worker = registration.installing;
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed' && nav.serviceWorker.controller) {
        waiting = worker;
        onReady?.();
      }
    });
  });
  doc?.addEventListener?.('visibilitychange', () => {
    if (doc.visibilityState === 'visible') registration.update?.().catch?.(() => {});
  });
  return {
    reload() {
      nav.serviceWorker.addEventListener('controllerchange', () => reloadPage(), { once: true });
      if (waiting) waiting.postMessage({ type: 'skip-waiting' });
      else reloadPage();
    },
  };
}

/** Registers the service worker. Returns a short status string for the diagnostics page; `onRegistration` gets the registration. */
export async function registerServiceWorker({
  navigator: nav = globalThis.navigator,
  base = './',
  onRegistration = null,
} = {}) {
  if (!nav?.serviceWorker) return 'not supported';
  try {
    const registration = await nav.serviceWorker.register(`${base}sw.js`, { scope: base });
    onRegistration?.(registration);
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

/**
 * Back and Forward buttons for a window that has none of its own (the desktop app, an Electron window). A browser keeps its own, so
 * the buttons stay hidden there.
 */
export function historyButtons({ doc = globalThis.document, win = globalThis.window } = {}) {
  const box = doc.getElementById('history-buttons');
  if (box === null || !/\bElectron\//.test(win.navigator.userAgent)) return;
  const back = doc.getElementById('nav-back');
  const forward = doc.getElementById('nav-forward');
  const refresh = () => {
    back.disabled = win.navigation?.canGoBack === false;
    forward.disabled = win.navigation?.canGoForward === false;
  };
  back.addEventListener('click', () => win.history.back());
  forward.addEventListener('click', () => win.history.forward());
  win.navigation?.addEventListener('currententrychange', refresh);
  box.hidden = false;
  refresh();
}
