// The collection: one download, stored in IndexedDB, updated safely (brief, stage 4; D17, D25).
//
// Rules this module enforces:
//   - the collection arrives as ONE zip (`collection/<archive>` named by `collection/latest.json`), with a progress callback;
//   - the archive's hash is checked against latest.json and every file against the pack manifest before anything is stored;
//   - a new version is downloaded in the background and written beside the old one; it becomes `pending`, never active;
//   - a version becomes active only when the app starts (`startSession`), so old and new files never mix in one session:
//     each session pins the version it started with and reads only from it;
//   - an old version is deleted only when no open window of the app still holds it (a Web Lock per version).

import { assertZipSafe, isSafeEntryName, readEntryText } from './zip-limits.js';

export const PACK_FORMAT_SUPPORTED = 1;
const SEP = '\u0000';
export const packKey = (version, path) => `${version}${SEP}${path}`;
const lockName = (version) => `cl-collection:${version}`;

const toHex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function sha256Hex(bytes, subtle = globalThis.crypto?.subtle) {
  return toHex(await subtle.digest('SHA-256', bytes));
}

/** Fetches a URL as bytes, reporting progress as (received, total) when the browser exposes the length. */
export async function fetchBytes(
  url,
  { fetchImpl = globalThis.fetch.bind(globalThis), onProgress = () => {}, signal } = {},
) {
  const response = await fetchImpl(url, { signal });
  if (!response.ok) throw new Error(`Download failed (HTTP ${response.status}).`);
  const total = Number(response.headers?.get?.('content-length')) || 0;
  if (response.body?.getReader === undefined) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    onProgress(bytes.length, total || bytes.length);
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(received, total);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

/**
 * Downloads, checks and stores one collection version. Returns its packmeta record. Nothing is stored if any check fails.
 * `latest` is the parsed latest.json: { version, archive, sha256, bytes, packFormatVersion, closedTesting? }.
 */
export async function installVersion({ idb, JSZip, latest, baseUrl = './', fetchImpl, onProgress, subtle }) {
  if (latest.packFormatVersion > PACK_FORMAT_SUPPORTED) {
    throw Object.assign(new Error('This collection needs a newer version of the app.'), { code: 'format_too_new' });
  }
  const archiveBytes = await fetchBytes(`${baseUrl}collection/${latest.archive}`, { fetchImpl, onProgress });
  if ((await sha256Hex(archiveBytes, subtle)) !== latest.sha256) {
    throw Object.assign(new Error('The downloaded collection did not match its checksum.'), {
      code: 'bad_archive_hash',
    });
  }
  return storeArchive({ idb, JSZip, bytes: archiveBytes, expectVersion: latest.version, subtle });
}

/**
 * Checks and stores a collection zip that is already in memory (downloaded, or chosen by the reader as a file). Every file is
 * checked against the manifest's hashes first; nothing is stored if any check fails. `expectVersion` (optional) is the version the
 * listing promised. `sideloaded` marks a collection the reader imported by hand: it is never replaced by the online one on its own.
 */
export async function storeArchive({
  idb,
  JSZip,
  bytes: archiveBytes,
  expectVersion = null,
  sideloaded = false,
  subtle,
}) {
  const zip = await JSZip.loadAsync(archiveBytes);
  assertZipSafe(zip.files);
  const manifest = JSON.parse(await readEntryText(zip, 'manifest.json'));
  if (
    typeof manifest.collectionVersion !== 'string' ||
    manifest.collectionVersion === '' ||
    manifest.files === undefined
  ) {
    throw Object.assign(new Error('This is not a collection file.'), { code: 'not_a_collection' });
  }
  if (manifest.packFormatVersion > PACK_FORMAT_SUPPORTED) {
    throw Object.assign(new Error('This collection needs a newer version of the app.'), { code: 'format_too_new' });
  }
  if (expectVersion !== null && manifest.collectionVersion !== expectVersion) {
    throw Object.assign(new Error('The collection version does not match its listing.'), { code: 'version_mismatch' });
  }
  const version = manifest.collectionVersion;
  const files = [];
  let bytes = 0;
  for (const [path, info] of Object.entries(manifest.files)) {
    if (!isSafeEntryName(path))
      throw Object.assign(new Error(`Unsafe file name in the manifest: ${path}`), { code: 'unsafe_name' });
    const text = await readEntryText(zip, path);
    const data = new TextEncoder().encode(text);
    if ((await sha256Hex(data, subtle)) !== info.sha256) {
      throw Object.assign(new Error(`${path} did not match its checksum.`), { code: 'bad_file_hash' });
    }
    files.push([path, text]);
    bytes += data.length;
  }
  for (const [path, text] of files) await idb.put('packs', packKey(version, path), text);
  const meta = {
    version,
    packFormatVersion: manifest.packFormatVersion,
    closedTesting: manifest.closedTesting === true,
    appOnly: manifest.appOnly === true,
    sideloaded,
    fileCount: files.length,
    bytes,
    installedAt: new Date().toISOString(),
  };
  // The meta record is written last: a version without one is an interrupted install and is cleaned up, never used.
  await idb.put('packmeta', version, meta);
  return meta;
}

/**
 * Imports a collection file the reader chose (stage 9 follow-up: a closed-testing bundle, or an offline update). With no collection in
 * use it becomes the active one at once; otherwise it waits as `pending` and is used the next time the app starts, like any update.
 * Returns { meta, activated } or { meta, pending }.
 */
export async function importCollection({ idb, JSZip, bytes, subtle }) {
  if (!(bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b)) {
    throw Object.assign(new Error('This is not a collection file.'), { code: 'not_a_collection' });
  }
  const meta = await storeArchive({ idb, JSZip, bytes, sideloaded: true, subtle });
  const active = await idb.get('meta', 'active');
  if (active === null) {
    await idb.put('meta', 'active', meta.version);
    return { meta, activated: true };
  }
  if (active === meta.version) return { meta, activated: false, pending: false, same: true };
  await idb.put('meta', 'pending', meta.version);
  return { meta, activated: false, pending: true };
}

/** Goes back to the online collection: forgets the active imported one so the next start downloads the online collection. */
export async function useOnlineCollection({ idb }) {
  await idb.delete('meta', 'active');
  await idb.delete('meta', 'pending');
}

/** Removes every stored file and the meta record of a version. */
export async function removeVersion(idb, version) {
  for (const key of await idb.keys('packs'))
    if (String(key).startsWith(`${version}${SEP}`)) await idb.delete('packs', key);
  await idb.delete('packmeta', version);
}

/**
 * Starts a session: promotes a pending version if there is one, pins the version for this session, holds a shared lock on it,
 * and removes versions nobody uses. Returns { version, meta, promoted } or { version: null } when nothing is installed.
 */
export async function startSession({ idb, locks = globalThis.navigator?.locks }) {
  const pending = await idb.get('meta', 'pending');
  let active = await idb.get('meta', 'active');
  let promoted = false;
  if (pending !== null && pending !== active && (await idb.get('packmeta', pending)) !== null) {
    await idb.put('meta', 'active', pending);
    active = pending;
    promoted = true;
  }
  if (pending !== null) await idb.delete('meta', 'pending');
  if (active === null || (await idb.get('packmeta', active)) === null) return { version: null, meta: null, promoted };
  // Hold the version for as long as this window lives. The promise never settles, so the lock lasts until the page closes.
  if (locks?.request) locks.request(lockName(active), { mode: 'shared' }, () => new Promise(() => {})).catch(() => {});
  await cleanup({ idb, locks, keep: active });
  return { version: active, meta: await idb.get('packmeta', active), promoted };
}

/** Deletes versions that are neither kept nor held by an open window. Without Web Locks nothing else is deleted. */
export async function cleanup({ idb, locks, keep }) {
  const held = new Set();
  if (locks?.query) {
    const state = await locks.query();
    for (const lock of [...(state.held ?? []), ...(state.pending ?? [])]) {
      if (lock.name?.startsWith('cl-collection:')) held.add(lock.name.slice('cl-collection:'.length));
    }
  } else {
    return [];
  }
  const removed = [];
  const pending = await idb.get('meta', 'pending');
  for (const version of await idb.keys('packmeta')) {
    if (version === keep || version === pending || held.has(version)) continue;
    await removeVersion(idb, version);
    removed.push(version);
  }
  // Files of an interrupted install (no meta record) are removed too.
  const known = new Set(await idb.keys('packmeta'));
  for (const key of await idb.keys('packs')) {
    const version = String(key).split(SEP)[0];
    if (!known.has(version) && !held.has(version)) await idb.delete('packs', key);
  }
  return removed;
}

/**
 * Looks for a newer collection and downloads it in the background. It only writes `pending`; it never changes what the
 * running session reads. Returns { status } where status is 'current', 'downloaded', 'offline' or 'error'.
 */
export async function checkForUpdate({
  idb,
  JSZip,
  baseUrl = './',
  fetchImpl = globalThis.fetch?.bind(globalThis),
  onProgress,
  subtle,
}) {
  let latest;
  try {
    const response = await fetchImpl(`${baseUrl}collection/latest.json`, { cache: 'no-store' });
    if (!response.ok) return { status: 'error', reason: `HTTP ${response.status}` };
    latest = await response.json();
  } catch {
    return { status: 'offline' };
  }
  const active = await idb.get('meta', 'active');
  const pending = await idb.get('meta', 'pending');
  // A collection the reader imported by hand is not replaced by the online one on its own.
  if (active !== null && (await idb.get('packmeta', active))?.sideloaded === true)
    return { status: 'sideloaded', version: active };
  if (latest.version === active || latest.version === pending) return { status: 'current', version: latest.version };
  if ((await idb.get('packmeta', latest.version)) === null) {
    try {
      await installVersion({ idb, JSZip, latest, baseUrl, fetchImpl, onProgress, subtle });
    } catch (error) {
      return { status: 'error', reason: error.message, code: error.code };
    }
  }
  await idb.put('meta', 'pending', latest.version);
  return { status: 'downloaded', version: latest.version };
}

/** First installation: download the listed version and make it active at once (there is nothing to mix with). */
export async function firstInstall({
  idb,
  JSZip,
  baseUrl = './',
  fetchImpl = globalThis.fetch.bind(globalThis),
  onProgress,
  subtle,
}) {
  const response = await fetchImpl(`${baseUrl}collection/latest.json`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not find the collection (HTTP ${response.status}).`);
  const latest = await response.json();
  const meta = await installVersion({ idb, JSZip, latest, baseUrl, fetchImpl, onProgress, subtle });
  await idb.put('meta', 'active', latest.version);
  return meta;
}

/** Reads a JSON file of a stored version. */
export async function readJson(idb, version, path) {
  const text = await idb.get('packs', packKey(version, path));
  if (text === null) throw new Error(`${path} is not in collection ${version}.`);
  return JSON.parse(text);
}

/** Bytes used by every stored version (what the app itself counts), and the browser's own estimate when it gives one. */
export async function storageUse({
  idb,
  estimate = globalThis.navigator?.storage?.estimate?.bind(globalThis.navigator.storage),
}) {
  let measured = 0;
  const versions = [];
  for (const version of await idb.keys('packmeta')) {
    const meta = await idb.get('packmeta', version);
    measured += meta.bytes;
    versions.push({ version, bytes: meta.bytes });
  }
  let browser;
  try {
    browser = estimate ? await estimate() : null;
  } catch {
    browser = null;
  }
  return {
    measuredBytes: measured,
    versions,
    browserUsage: browser?.usage ?? null,
    browserQuota: browser?.quota ?? null,
  };
}
