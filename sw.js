// ── SERVICE WORKER (web build only) ───────────────────────────────────────────
// Lets the web version open and run offline once it has been loaded (ported from the Bible Study Reader).
//
// Do not deploy this file as it stands. build/build-app.js copies it into the build with the two marked lines below replaced by
// the real file list and a build id, so the file changes whenever any app file changes: a changed sw.js is how the browser
// learns there is a new version.
//
//   • install   – downloads every file in PRECACHE into a cache named for the build. Files unchanged since the previous build
//                 are copied from the old cache, not downloaded again. If a required file cannot be fetched the install
//                 fails and the old version keeps running.
//   • no skipWaiting – a new build waits until every window of the app has closed, then takes over. Old and new files are
//                 never mixed in one session, and readers see no prompt.
//   • activate  – deletes caches of older builds.
//   • fetch     – same-origin GET requests only. A page load anywhere under the scope gets index.html (the app is one page
//                 with history routes). Code, strings and icons come from the cache. The collection (collection/…) is NOT
//                 cached here: the app downloads it once and keeps it in IndexedDB.

const PRECACHE = [{"url":"css/app.css","hash":"d4a7369736b0c765"},{"url":"images/favicon.svg","hash":"ce85a1175547fffd","optional":true},{"url":"images/icon-192.png","hash":"cde41bc97307f127","optional":true},{"url":"images/icon-512.png","hash":"948ee81024b83987","optional":true},{"url":"index.html","hash":"ccdccf55df4a44f3"},{"url":"js/ask-ai-ui.js","hash":"8b69824f23327021"},{"url":"js/ask-ai.js","hash":"1bd9104e31ed4fdf"},{"url":"js/backup.js","hash":"a6ffb9047542709a"},{"url":"js/cite.js","hash":"f1fb34559d6f3309"},{"url":"js/collection.js","hash":"6753d1d82725b109"},{"url":"js/compare.js","hash":"458cd15813b1b7f8"},{"url":"js/data.js","hash":"fe333df2e6f8f5e4"},{"url":"js/diagnostics.js","hash":"ccb8e496a53f6ec3"},{"url":"js/error-report.js","hash":"35270cedbaac9127"},{"url":"js/export.js","hash":"6c37d796fca11c29"},{"url":"js/format-text.js","hash":"886439f2abefd047"},{"url":"js/i18n.js","hash":"f456451723458021"},{"url":"js/idb.js","hash":"a4b29547918744a0"},{"url":"js/import-ui.js","hash":"56ce6576ab60d631"},{"url":"js/lists.js","hash":"0b88c387111d758a"},{"url":"js/main.js","hash":"bc938556554fc1f4"},{"url":"js/my-library.js","hash":"5b706f35465861a5"},{"url":"js/pages.js","hash":"80c3650e60fbb0b3"},{"url":"js/report.js","hash":"1d86b0c6cca4647c"},{"url":"js/review-ui.js","hash":"2c920a3afc24e1ea"},{"url":"js/review.js","hash":"d84461824e254c61"},{"url":"js/router.js","hash":"1166c7b1c3459f87"},{"url":"js/search-ui.js","hash":"800fe2a9323bb855"},{"url":"js/search.js","hash":"b1a955cf5ae76ca4"},{"url":"js/timeline.js","hash":"9ff8d8a6b1e58990"},{"url":"js/tokenise.js","hash":"5732150d8a694610"},{"url":"js/ui.js","hash":"92f1f8533e09a6a8"},{"url":"js/vendor/jszip.min.js","hash":"7f839b2d4688b845"},{"url":"js/vendor/purify.es.mjs","hash":"5e8c53cd086a0125"},{"url":"js/viewer.js","hash":"94e42e1bf4cfafaa"},{"url":"js/views.js","hash":"66ec976149ad08be"},{"url":"js/web-app.js","hash":"b35b37cc3247ecc4"},{"url":"js/workspace-ui.js","hash":"1b0ac3a6e11ca546"},{"url":"js/workspace.js","hash":"b3054793dd3f7fb9"},{"url":"js/zip-limits.js","hash":"46eec5a371abae2d"},{"url":"locales/en.json","hash":"e837c80c8a58d765"},{"url":"locales/fr.json","hash":"a077870b14bb6192"},{"url":"manifest.webmanifest","hash":"3603481788357684"}];
const BUILD_ID = '378a757184ab';

const CODE_CACHE_PREFIX = 'cl-code-';
const CODE_CACHE = CODE_CACHE_PREFIX + BUILD_ID;
const MANIFEST_KEY = '__cl_manifest__';
const SHELL_URL = 'index.html';

async function previousBuilds() {
  const out = [];
  for (const name of await caches.keys()) {
    if (!name.startsWith(CODE_CACHE_PREFIX) || name === CODE_CACHE) continue;
    const cache = await caches.open(name);
    const res = await cache.match(MANIFEST_KEY);
    if (!res) continue;
    try {
      out.push({ cache, hashes: await res.json() });
    } catch {
      /* unreadable: ignore */
    }
  }
  return out;
}

async function fetchOrCopy(file, cache, previous) {
  for (const { cache: old, hashes } of previous) {
    if (hashes[file.url] !== file.hash) continue;
    const kept = await old.match(file.url);
    if (kept) {
      await cache.put(file.url, kept);
      return;
    }
  }
  const res = await fetch(file.url, { cache: 'reload' });
  if (!res.ok) throw new Error(`${file.url}: HTTP ${res.status}`);
  await cache.put(file.url, res);
}

async function precache() {
  const cache = await caches.open(CODE_CACHE);
  const previous = await previousBuilds();
  const results = await Promise.allSettled(PRECACHE.map((f) => fetchOrCopy(f, cache, previous)));
  const failed = PRECACHE.filter((f, i) => results[i].status === 'rejected');
  if (failed.some((f) => !f.optional)) {
    await caches.delete(CODE_CACHE);
    throw new Error(
      'precache failed: ' +
        failed
          .filter((f) => !f.optional)
          .map((f) => f.url)
          .join(', '),
    );
  }
  const hashes = {};
  PRECACHE.forEach((f, i) => {
    if (results[i].status === 'fulfilled') hashes[f.url] = f.hash;
  });
  await cache.put(
    MANIFEST_KEY,
    new Response(JSON.stringify(hashes), { headers: { 'Content-Type': 'application/json' } }),
  );
}

self.addEventListener('install', (event) => event.waitUntil(precache()));

async function removeOldBuilds() {
  for (const name of await caches.keys()) {
    if (name.startsWith(CODE_CACHE_PREFIX) && name !== CODE_CACHE) await caches.delete(name);
  }
}

self.addEventListener('activate', (event) => event.waitUntil(removeOldBuilds().then(() => self.clients.claim())));

function isCollectionRequest(url) {
  const scope = new URL('./', self.location.href).pathname;
  return url.pathname.startsWith(scope + 'collection/');
}

async function respond(request) {
  const url = new URL(request.url);
  if (isCollectionRequest(url)) return fetch(request);
  const code = await caches.open(CODE_CACHE);
  if (request.mode === 'navigate') {
    const shell = await code.match(SHELL_URL);
    return shell || fetch(request);
  }
  const hit = await code.match(request, { ignoreSearch: true });
  return hit || fetch(request);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(respond(request));
});
