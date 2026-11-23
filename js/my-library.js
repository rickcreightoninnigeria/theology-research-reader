// Private library: "Open my copy" (the file, in the default program for its type) and "Show in Zotero" for the reader's own copies. The map comes from a private file that only
// the local server provides (dist/private/my-library.json, see build/library-links.js); on a public site there is no such file and the app
// shows nothing. Links are built only from identifiers that pass a strict check, so nothing from the file can inject anything into a link.

const ZOTERO_KEY = /^[A-Z0-9]{8}$/;

/** True on the reader's own machine. Only there is the private file looked for, so a public site never even asks for it. */
export const isLocalHost = (hostname) => ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname);

/** Reads the private map, or returns null when there is none (the normal case) or it is not valid. */
export async function loadMyLibrary({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  baseUrl = './',
  hostname = globalThis.location?.hostname,
} = {}) {
  if (!isLocalHost(hostname)) return null;
  try {
    const response = await fetchImpl(`${baseUrl}private/my-library.json`, { cache: 'no-store' });
    if (!response.ok || !(response.headers.get('content-type') ?? '').includes('json')) return null;
    const map = await response.json();
    if ((map?.format !== 1 && map?.format !== 2) || typeof map.entries !== 'object' || map.entries === null)
      return null;
    return map;
  } catch {
    return null;
  }
}

/** The Zotero link for one source: [{ kind: 'zotero-item', url }], or none. */
export function linksFor(map, sourceId) {
  const entry = map?.entries?.[sourceId];
  if (entry === undefined || entry === null) return [];
  if (typeof entry.zotero?.item === 'string' && ZOTERO_KEY.test(entry.zotero.item)) {
    return [{ kind: 'zotero-item', url: `zotero://select/library/items/${entry.zotero.item}` }];
  }
  return [];
}

/** The format of the reader's own file for a source ('pdf', 'epub' and so on), or null when the server found none. */
export function openFormat(map, sourceId) {
  const format = map?.entries?.[sourceId]?.open?.format;
  return typeof format === 'string' && /^[a-z0-9]{1,6}$/.test(format) ? format : null;
}

/** Asks the local server to open the reader's own file in the computer's default program. Resolves { ok, message }. */
export async function openCopy(map, sourceId, { fetchImpl = globalThis.fetch?.bind(globalThis), baseUrl = './' } = {}) {
  if (openFormat(map, sourceId) === null || typeof map.openToken !== 'string') return { ok: false, message: 'none' };
  try {
    const response = await fetchImpl(`${baseUrl}private/open`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-open-token': map.openToken },
      body: JSON.stringify({ source: sourceId }),
    });
    return response.ok ? { ok: true, message: '' } : { ok: false, message: await response.text() };
  } catch {
    return { ok: false, message: 'unreachable' };
  }
}
