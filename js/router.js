// A small router on the History API. Routes are paths under a base ("/" or "/theology-research-reader/"); the build writes the
// shell for any path (404.html on static hosts, the service worker offline), so a deep link or a reload works.

export const ROUTES = [
  { name: 'home', pattern: /^\/$/, params: [] },
  { name: 'sources', pattern: /^\/sources\/?$/, params: [] },
  { name: 'record', pattern: /^\/record\/([^/]+)\/?$/, params: ['id'] },
  { name: 'publication', pattern: /^\/publication\/([^/]+)\/?$/, params: ['id'] },
  { name: 'argument', pattern: /^\/argument\/([^/]+)\/?$/, params: ['id'] },
  { name: 'concept', pattern: /^\/concept\/([^/]+)\/?$/, params: ['id'] },
  { name: 'thinker', pattern: /^\/thinker\/([^/]+)\/?$/, params: ['id'] },
  { name: 'scholar', pattern: /^\/scholar\/([^/]+)\/?$/, params: ['id'] },
  { name: 'search', pattern: /^\/search\/?$/, params: [] },
  { name: 'publications', pattern: /^\/publications\/?$/, params: [] },
  { name: 'themes', pattern: /^\/themes\/?$/, params: [] },
  { name: 'arguments', pattern: /^\/arguments\/?$/, params: [] },
  { name: 'thinkers', pattern: /^\/thinkers\/?$/, params: [] },
  { name: 'timeline', pattern: /^\/timeline\/?$/, params: [] },
  { name: 'pathways', pattern: /^\/pathways\/?$/, params: [] },
  { name: 'review', pattern: /^\/pathway\/([^/]+)\/review\/?$/, params: ['id'] },
  { name: 'pathway', pattern: /^\/pathway\/([^/]+)\/?$/, params: ['id'] },
  { name: 'start', pattern: /^\/start\/?$/, params: [] },
  { name: 'position', pattern: /^\/position\/([^/]+)\/?$/, params: ['id'] },
  { name: 'compare', pattern: /^\/compare\/?$/, params: [] },
  { name: 'workspace', pattern: /^\/workspace\/?$/, params: [] },
  { name: 'project', pattern: /^\/project\/([^/]+)\/?$/, params: ['id'] },
  { name: 'privacy', pattern: /^\/privacy\/?$/, params: [] },
  { name: 'about', pattern: /^\/about\/?$/, params: [] },
  { name: 'settings', pattern: /^\/settings\/?$/, params: [] },
  { name: 'diagnostics', pattern: /^\/diagnostics\/?$/, params: [] },
];

/** The part of a pathname under the base, always starting with "/". */
export function stripBase(pathname, base = '/') {
  const normalBase = base.endsWith('/') ? base : `${base}/`;
  if (pathname === normalBase.slice(0, -1)) return '/';
  if (pathname.startsWith(normalBase)) return `/${pathname.slice(normalBase.length)}`;
  return pathname;
}

/** Matches a path to a route. Returns { name, params }; an unknown path gives { name: 'notFound' }. */
export function parseRoute(path) {
  for (const route of ROUTES) {
    const match = route.pattern.exec(path);
    if (match !== null) {
      const params = {};
      route.params.forEach((name, index) => {
        try {
          params[name] = decodeURIComponent(match[index + 1]);
        } catch {
          params[name] = match[index + 1];
        }
      });
      return { name: route.name, params };
    }
  }
  return { name: 'notFound', params: {} };
}

/** The path for a route name, the inverse of parseRoute. */
export function buildPath(name, params = {}) {
  switch (name) {
    case 'home':
      return '/';
    case 'sources':
      return '/sources';
    case 'record':
      return `/record/${encodeURIComponent(params.id)}`;
    case 'publication':
    case 'argument':
    case 'concept':
    case 'thinker':
    case 'scholar':
      return `/${name}/${encodeURIComponent(params.id)}`;
    case 'pathway':
      return `/pathway/${encodeURIComponent(params.id)}`;
    case 'review':
      return `/pathway/${encodeURIComponent(params.id)}/review`;
    case 'search':
    case 'publications':
    case 'themes':
    case 'arguments':
    case 'thinkers':
    case 'timeline':
    case 'pathways':
    case 'start':
    case 'project':
      return `/project/${encodeURIComponent(params.id)}`;
    case 'position':
      return `/position/${encodeURIComponent(params.id)}`;
    case 'compare':
      return '/compare';
    case 'workspace':
    case 'privacy':
    case 'about':
      return `/${name}`;
    case 'settings':
      return '/settings';
    case 'diagnostics':
      return '/diagnostics';
    default:
      throw new Error(`Unknown route ${name}`);
  }
}

/** Connects the router to a window. `render(route)` draws the view; links marked data-link navigate without a page load. */
export function createRouter({ window: win = globalThis.window, base = '/', render }) {
  const normalBase = base.endsWith('/') ? base : `${base}/`;
  const current = () => parseRoute(stripBase(win.location.pathname, normalBase));
  const show = () => render(current());

  function go(path, { replace = false } = {}) {
    const url = normalBase + path.replace(/^\//, '');
    win.history[replace ? 'replaceState' : 'pushState']({}, '', url);
    show();
  }

  win.addEventListener('popstate', show);
  win.document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
    const link = event.target.closest?.('a[data-link]');
    if (link === null || link === undefined) return;
    event.preventDefault();
    const target = new URL(link.href, win.location.href);
    go(stripBase(target.pathname, normalBase) + target.search);
  });

  return { go, show, current, hrefFor: (path) => normalBase + path.replace(/^\//, '') };
}
