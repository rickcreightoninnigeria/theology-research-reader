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

/** The state of the reader's collections, from the local server, or null where there is none to ask. */
export async function loadCollectionStatus({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  baseUrl = './',
  hostname = globalThis.location?.hostname,
} = {}) {
  if (!isLocalHost(hostname)) return null;
  try {
    const response = await fetchImpl(`${baseUrl}private/collections.json`, { cache: 'no-store' });
    if (!response.ok || !(response.headers.get('content-type') ?? '').includes('json')) return null;
    const status = await response.json();
    return Array.isArray(status?.collections) ? status : null;
  } catch {
    return null;
  }
}

/** The ids of the other collections this computer can open (the desktop app only), or none. */
export async function loadLenses({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  baseUrl = './',
  hostname = globalThis.location?.hostname,
} = {}) {
  if (!isLocalHost(hostname)) return [];
  try {
    const response = await fetchImpl(`${baseUrl}private/lenses.json`, { cache: 'no-store' });
    if (!response.ok || !(response.headers.get('content-type') ?? '').includes('json')) return [];
    const { open } = await response.json();
    return Array.isArray(open) ? open.filter((id) => typeof id === 'string' && /^[\w-]+$/.test(id)) : [];
  } catch {
    return [];
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

/** Which kind of position the reader's own file can be opened at: 'page' (a PDF), 'section' (an EPUB) or null. */
export function positionKind(map, sourceId) {
  const open = map?.entries?.[sourceId]?.open;
  if (open?.pages === true) return 'page';
  if (open?.sections === true) return 'section';
  return null;
}

/** The printed page named by a quotation's locator ("p. 13", "pp. 12-14", "printed p. 40"), or null. */
export function pageFromLocator(locator) {
  const text = String(locator ?? '');
  const printed = /printed pp?\.\s*(\d{1,4})\b/i.exec(text) ?? /(?<!PDF\s)\bpp?\.\s*(\d{1,4})\b/.exec(text);
  return printed ? Number(printed[1]) : null;
}

/** The printed page a claim cites at the end of its text, "(p. 26)" or "(pp. 12-14)", or null. */
export function pageFromClaim(text) {
  const m = /\((?:[^()]*;\s*)?pp?\.\s*(\d{1,4})(?:[-–]\d{1,4})?[^()]*\)\.?\s*$/.exec(String(text ?? ''));
  return m ? Number(m[1]) : null;
}

/**
 * Asks the local server to open the reader's own file in the computer's default program, at `page` (a printed page number, PDFs) or
 * `section` (a chapter title, EPUBs) when given. Resolves { ok, message }.
 */
export async function openCopy(
  map,
  sourceId,
  { page = null, section = null, quote = null, fetchImpl = globalThis.fetch?.bind(globalThis), baseUrl = './' } = {},
) {
  if (openFormat(map, sourceId) === null || typeof map.openToken !== 'string') return { ok: false, message: 'none' };
  const request = { source: sourceId };
  if (Number.isInteger(page)) request.page = page;
  if (typeof section === 'string' && section !== '') request.section = section;
  if (typeof quote === 'string' && quote !== '') request.quote = quote;
  try {
    const response = await fetchImpl(`${baseUrl}private/open`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-open-token': map.openToken },
      body: JSON.stringify(request),
    });
    return response.ok ? { ok: true, message: '' } : { ok: false, message: await response.text() };
  } catch {
    return { ok: false, message: 'unreachable' };
  }
}

/** The address of the reader's own cover image for a source (a Calibre cover.jpg), or null. Only the local server provides it. */
export function coverUrl(map, sourceId, baseUrl = './') {
  if (map?.entries?.[sourceId]?.cover !== true || !/^[\w.-]{1,120}$/.test(sourceId)) return null;
  return `${baseUrl}private/cover/${encodeURIComponent(sourceId)}.jpg`;
}

/** True when the quotation's words were found in the reader's own copy, so it can be opened at the quotation. */
export function isLocated(map, quoteId) {
  return Array.isArray(map?.located) && map.located.includes(quoteId);
}
