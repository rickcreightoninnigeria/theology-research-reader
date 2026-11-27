// Application start-up. It wires the modules together; the logic lives in the modules and is tested there.

import './vendor/jszip.min.js'; // sets globalThis.JSZip
import { collectDiagnostics, formatDiagnosticsReport } from './diagnostics.js';
import { checkForUpdate, firstInstall, readJson, startSession, storageUse } from './collection.js';
import { createErrorLog, installGlobalHandlers, showErrorBanner } from './error-report.js';
import { LANGUAGES, createI18n, resolveLanguage } from './i18n.js';
import { createIdb } from './idb.js';
import { buildPath, createRouter } from './router.js';
import { createSearch } from './search.js';
import { renderSearch } from './search-ui.js';
import { createData } from './data.js';
import {
  notFound,
  renderAbout,
  renderArgument,
  renderChapter,
  renderConcept,
  renderPrivacy,
  renderPublication,
  renderScholar,
  renderThinker,
} from './pages.js';
import {
  renderArgumentsList,
  renderHome,
  renderPathway,
  renderPathways,
  renderPublications,
  renderStart,
  renderThemes,
  renderThinkers,
} from './lists.js';
import { renderReview } from './review-ui.js';
import { renderCompare, renderPosition, renderTimeline } from './views.js';
import { renderDiagnostics, renderSettings, renderSources } from './viewer.js';
import { importBlock } from './import-ui.js';
import { loadCollectionStatus, loadLenses, loadMyLibrary } from './my-library.js';
import { backupBlock, renderProject, renderWorkspace } from './workspace-ui.js';
import {
  historyButtons,
  isOwnComputer,
  needsHomeScreenHint,
  registerServiceWorker,
  requestDurableStorage,
  watchForNewBuild,
} from './web-app.js';

const doc = document;
const appRoot = new URL('../', import.meta.url);
const base = appRoot.pathname;
const baseUrl = appRoot.href;
const appVersion = doc.querySelector('meta[name="app-version"]')?.content ?? 'dev';

const errorLog = createErrorLog();
const i18n = createI18n({ baseUrl, onMissing: (key) => errorLog.record(new Error(`Missing string: ${key}`), 'i18n') });
const tt = (key, params) => i18n.t(key, params);

// The page has a <base> element, so a plain "#view" link would leave the page. The skip link moves focus itself.
doc.querySelector('.skip')?.addEventListener('click', (event) => {
  event.preventDefault();
  doc.getElementById('view').focus();
});

const statusEl = doc.getElementById('status');
const viewEl = doc.getElementById('view');
const setStatus = (text, { quiet = false } = {}) => {
  statusEl.textContent = text;
  // "Ready." is for screen readers; the desktop stylesheet shows other messages only.
  statusEl.dataset.state = quiet ? 'quiet' : 'message';
};

/** The bar at the top for "a new version is ready" (own computer only). `onClick` takes the new version up. */
const showUpdateBar = (textKey, onClick) => {
  const bar = doc.getElementById('update-ready');
  if (bar === null) return;
  bar.querySelector('span').textContent = tt(textKey);
  bar.hidden = false;
  bar.querySelector('button').onclick = onClick;
};

installGlobalHandlers(window, errorLog, (entry) =>
  showErrorBanner(doc, entry, { text: tt('error_banner'), dismissLabel: tt('error_dismiss') }),
);

const state = {
  lenses: [],
  myLibrary: null,
  serviceWorker: null,
  persisted: null,
  pending: null,
  session: null,
  ctx: null,
};
const idb = createIdb();

const REQUIRED_FILES = ['master-index', 'sources', 'records', 'claims', 'quotations'];
const OPTIONAL_FILES = {
  history: [],
  pathways: [],
  hubs: {},
  timeline: { events: [] },
  thinkers: [],
  concepts: [],
  arguments: [],
  positions: [],
  interpretations: [],
  relationships: [],
  'relationship-types': {},
  corrections: [],
  site: {},
  'thinkers-page': null,
  'short-titles': [],
};

/** Reads the pack files into one context. An older collection that lacks an optional file gets an empty one. */
async function loadContext(version, meta) {
  const files = {};
  await Promise.all(
    REQUIRED_FILES.map(
      async (name) =>
        (files[name === 'master-index' ? 'masterIndex' : name] = await readJson(idb, version, `${name}.json`)),
    ),
  );
  await Promise.all(
    Object.entries(OPTIONAL_FILES).map(async ([name, fallback]) => {
      try {
        files[name] = await readJson(idb, version, `${name}.json`);
      } catch {
        files[name] = fallback;
      }
    }),
  );
  return { collection: meta, masterIndex: files.masterIndex, data: createData(files) };
}

let searchEngine = null;
/** The search index is read from the stored collection the first time a search is made, then kept for the session. */
async function getSearch() {
  if (searchEngine === null) {
    const [index, variants] = await Promise.all([
      readJson(idb, state.session.version, 'search-index.json'),
      readJson(idb, state.session.version, 'variants.json'),
    ]);
    searchEngine = createSearch({ index, variants });
  }
  return searchEngine;
}

const LAST_KEY = 'cl_last';
const readLast = () => {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) ?? 'null');
  } catch {
    return null;
  }
};
const writeLast = (value) => {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(value));
  } catch {
    // not saved: "continue where you left off" simply stays empty
  }
};
const NOT_REMEMBERED = new Set([
  'home',
  'search',
  'settings',
  'diagnostics',
  'start',
  'notFound',
  'workspace',
  'project',
]);

const mb = (bytes) => (bytes === null || bytes === undefined ? '—' : `${(bytes / 1048576).toFixed(2)} MB`);

async function diagnosticsReport() {
  const storage = await storageUse({ idb });
  const data = await collectDiagnostics({
    appVersion,
    collection: state.ctx ? { ...state.ctx.collection, pending: state.pending } : null,
    storage,
    online: navigator.onLine,
    errors: errorLog.list(),
    locale: { ui: i18n.uiLanguage, content: i18n.contentLanguage },
    persisted: state.persisted,
    serviceWorker: state.serviceWorker,
    idb,
    collections: await loadCollectionStatus({ baseUrl }),
  });
  const date = new Intl.DateTimeFormat(i18n.uiLanguage, { dateStyle: 'medium', timeStyle: 'short' });
  return formatDiagnosticsReport(data, tt, (iso) => date.format(new Date(iso)));
}

let router;
async function render(route) {
  const ctx = {
    ...(state.ctx ?? {}),
    href: (path) => router.hrefFor(path),
    languages: LANGUAGES,
    uiLanguage: i18n.uiLanguage,
    contentLanguage: i18n.contentLanguage,
    storageText: mb((await storageUse({ idb })).measuredBytes),
  };
  const args = { doc, t: tt, ctx };
  const pageCtx = {
    idb,
    random: Math.random,
    myLibrary: state.myLibrary,
    lenses: state.lenses,
    baseUrl,
    uiLanguage: i18n.uiLanguage,
    collectionMeta: state.ctx?.collection ?? null,
    errorLog,
    confirm: (message) => window.confirm(message),
    go: (path) => router.go(path),
    settings: () => ({ uiLanguage: i18n.uiLanguage, contentLanguage: i18n.contentLanguage }),
    doc,
    t: tt,
    data: state.ctx?.data,
    href: ctx.href,
    appVersion,
    now: () => new Date(),
    origin: location.origin,
  };
  let view;
  if (route.name === 'diagnostics') view = renderDiagnostics({ doc, t: tt, report: await diagnosticsReport() });
  else if (route.name === 'settings') {
    view = renderSettings(args);
    if (state.ctx !== null) view.append(importBlock(pageCtx, { current: state.ctx.collection }), backupBlock(pageCtx));
  } else if (route.name === 'workspace' && state.ctx !== null) view = renderWorkspace(pageCtx);
  else if (route.name === 'project' && state.ctx !== null) view = renderProject(pageCtx, route.params.id);
  else if (state.ctx === null) view = renderHome({ ...pageCtx, data: undefined });
  else if (route.name === 'home')
    view = renderHome(
      { ...pageCtx, masterIndex: state.ctx.masterIndex },
      { last: readLast(), online: navigator.onLine, pending: state.pending },
    );
  else if (route.name === 'search') {
    const engine = await getSearch();
    view = renderSearch(pageCtx, {
      search: location.search,
      run: (query, filters) => engine.search(query, filters),
      go: (queryString) => router.go(`/search${queryString}`),
    });
  } else if (route.name === 'sources') view = renderSources(args);
  else if (route.name === 'publications') view = renderPublications(pageCtx);
  else if (route.name === 'themes') view = renderThemes(pageCtx);
  else if (route.name === 'arguments') view = renderArgumentsList(pageCtx);
  else if (route.name === 'thinkers') view = renderThinkers(pageCtx);
  else if (route.name === 'timeline')
    view = renderTimeline(pageCtx, { search: location.search, go: (q) => router.go(`/timeline${q}`) });
  else if (route.name === 'position') view = renderPosition(pageCtx, route.params.id);
  else if (route.name === 'compare')
    view = renderCompare(pageCtx, { search: location.search, go: (q) => router.go(`/compare${q}`) });
  else if (route.name === 'pathways') view = renderPathways(pageCtx);
  else if (route.name === 'pathway') view = renderPathway(pageCtx, route.params.id);
  else if (route.name === 'review') view = renderReview(pageCtx, route.params.id);
  else if (route.name === 'start') view = renderStart(pageCtx);
  else if (route.name === 'about') view = renderAbout(pageCtx);
  else if (route.name === 'privacy') view = renderPrivacy(pageCtx);
  else if (route.name === 'publication') view = renderPublication(pageCtx, route.params.id);
  else if (route.name === 'record') {
    // A source-level record is shown as its publication page; any other record as a chapter page.
    view = state.ctx.data.sources.has(route.params.id)
      ? renderPublication(pageCtx, route.params.id)
      : renderChapter(pageCtx, route.params.id);
  } else if (route.name === 'argument') view = renderArgument(pageCtx, route.params.id);
  else if (route.name === 'concept') view = renderConcept(pageCtx, route.params.id);
  else if (route.name === 'thinker' || route.name === 'scholar') {
    // The person's kind in this collection decides the page, so a link from another collection may use either address.
    const scholar = state.ctx.data.thinkers.get(route.params.id)?.kind === 'scholar';
    view = (scholar ? renderScholar : renderThinker)(pageCtx, route.params.id);
  } else view = notFound(pageCtx);
  viewEl.replaceChildren(view);
  if (!NOT_REMEMBERED.has(route.name) && view.querySelector('h1'))
    writeLast({ path: buildPath(route.name, route.params), title: view.querySelector('h1').textContent });
  doc.title = `${view.querySelector('h1')?.textContent ?? ''} — ${tt('app_title')}`.replace(/^ — /, '');
  viewEl.focus({ preventScroll: false });
  window.scrollTo(0, 0);
  if (location.hash)
    viewEl
      .querySelector(CSS.escape ? `#${CSS.escape(decodeURIComponent(location.hash.slice(1)))}` : location.hash)
      ?.scrollIntoView();
  const select = doc.getElementById('ui-language');
  if (select) {
    select.addEventListener('change', async () => {
      await i18n.setUiLanguage(select.value);
      doc.documentElement.lang = i18n.uiLanguage;
      i18n.applyToDom(doc);
      router.show();
    });
  }
  const copy = doc.getElementById('copy-report');
  if (copy) {
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(doc.getElementById('diagnostics-report').textContent);
        setStatus(tt('diag_copied'));
      } catch (error) {
        errorLog.record(error, 'copy');
      }
    });
  }
}

async function installFirstCollection() {
  setStatus(tt('status_downloading', { percent: 0 }));
  const progress = doc.createElement('progress');
  progress.max = 100;
  progress.value = 0;
  statusEl.append(' ', progress);
  try {
    await firstInstall({
      idb,
      JSZip: globalThis.JSZip,
      baseUrl,
      onProgress: (received, total) => {
        const percent = total > 0 ? Math.floor((received / total) * 100) : 0;
        progress.value = percent;
        statusEl.firstChild.textContent = tt('status_downloading', { percent });
      },
    });
    setStatus(tt('status_installing'));
  } catch (error) {
    errorLog.record(error, 'download');
    setStatus(tt('status_first_load_failed'));
    throw error;
  }
}

async function start() {
  const language = i18n.savedUiLanguage() ?? resolveLanguage(navigator.languages);
  await i18n.load(language);
  doc.documentElement.lang = i18n.uiLanguage;
  i18n.applyToDom(doc);
  setStatus(tt('status_loading'));

  router = createRouter({ window, base, render });
  historyButtons();

  let session = await startSession({ idb });
  if (session.version === null) {
    try {
      await installFirstCollection();
      session = await startSession({ idb });
    } catch {
      router.show();
      return;
    }
  }
  state.session = session;
  state.ctx = await loadContext(session.version, session.meta);
  // Strings that name the author a collection is about ("In {subject}") use the collection's own subject.
  const site = state.ctx.data?.site ?? {};
  i18n.setDefaults({ subject: site.subjectShort ?? site.subject ?? '', subject_full: site.subject ?? '' });
  // Only on the reader's own machine: a private map of the reader's Zotero and Calibre copies (never on a public site).
  state.myLibrary = await loadMyLibrary({ baseUrl });
  state.lenses = await loadLenses({ baseUrl });
  if (session.meta.closedTesting) doc.getElementById('test-banner').hidden = false;
  doc.documentElement.dataset.collection = session.version;
  setStatus(navigator.onLine ? tt('status_ready') : tt('status_offline_ready'), { quiet: true });
  router.show();
  doc.documentElement.dataset.ready = '1';

  state.serviceWorker = await registerServiceWorker({
    base,
    onRegistration: (registration) => {
      // On the reader's own computer a new build of the app can be taken up with one click (elsewhere it waits for the windows to close).
      const watcher = watchForNewBuild(registration, {
        onReady: () => showUpdateBar('update_ready', () => watcher.reload()),
      });
    },
  });
  state.persisted = await requestDurableStorage();
  if (needsHomeScreenHint()) doc.getElementById('ios-hint').hidden = false;

  // Look for a newer collection in the background. It is stored for the next start and never changes this session.
  const result = await checkForUpdate({ idb, JSZip: globalThis.JSZip, baseUrl });
  if (result.status === 'downloaded') {
    state.pending = result.version;
    doc.documentElement.dataset.pending = result.version;
    setStatus(tt('status_update_ready'));
    // On the reader's own computer a downloaded collection can be taken up at once: a restart promotes it.
    if (isOwnComputer()) showUpdateBar('update_ready_collection', () => globalThis.location.reload());
  } else if (result.status === 'error') errorLog.record(new Error(result.reason), 'update');
  doc.documentElement.dataset.updateChecked = result.status;
}

start().catch((error) => {
  errorLog.record(error, 'start');
  showErrorBanner(doc, errorLog.list().at(-1), { text: tt('error_banner'), dismissLabel: tt('error_dismiss') });
});
