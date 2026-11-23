// The personal workspace (stage 7, D19, D23): notes, bookmarks, research projects (and reading lists), and learning progress.
// Everything is local: records live in the `userdata` store of IndexedDB, each with a stable id and a timestamp per field, so a
// restore or a later sync can keep the newer copy of every field. Nothing is ever really removed by a normal "delete": a record
// gets `deleted: true` with its own timestamp, so an older backup cannot bring it back. Only "delete all my data" removes records.
//
// Key forms in `userdata`:
//   note:<id>                  fields: target, text, createdAt, deleted
//   bookmark:<target id>       fields: target, deleted               (one per target, so two devices agree)
//   project:<id>               fields: title, question, kind ('project' or 'reading-list'), deleted
//   projitem:<project>|<target> fields: project, target, order, deleted
//   progress:<target id>       fields: target, state ('unread', 'reading', 'read')

export const PROGRESS_STATES = ['unread', 'reading', 'read'];
export const PROJECT_KINDS = ['project', 'reading-list'];

/** A new stable id. */
export function newId(crypto = globalThis.crypto) {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** All live (not deleted) records with a key prefix, as { key, fields, _t }. */
async function listPrefix(idb, prefix) {
  const out = [];
  for (const key of await idb.keys('userdata')) {
    if (typeof key !== 'string' || !key.startsWith(prefix)) continue;
    const record = await idb.get('userdata', key);
    if (record !== null && record.fields?.deleted !== true) out.push({ key, ...record });
  }
  return out;
}

// ── notes ──────────────────────────────────────────────────────────────────────

export async function addNote({ idb, target, text, now = Date.now(), id = newId() }) {
  const key = `note:${id}`;
  await idb.setFields('userdata', key, { target, text, createdAt: now, deleted: false }, now);
  return key;
}

export const updateNote = ({ idb, key, text, now = Date.now() }) => idb.setFields('userdata', key, { text }, now);

/** Soft delete: the note stays in storage, marked deleted, so an older backup cannot bring it back. */
export const deleteNote = ({ idb, key, now = Date.now() }) => idb.setFields('userdata', key, { deleted: true }, now);

export async function listNotes(idb, { targets = null } = {}) {
  const notes = await listPrefix(idb, 'note:');
  const wanted = targets === null ? null : new Set(targets);
  return notes
    .filter((n) => wanted === null || wanted.has(n.fields.target))
    .sort((a, b) => (a.fields.createdAt ?? 0) - (b.fields.createdAt ?? 0));
}

// ── bookmarks ──────────────────────────────────────────────────────────────────

export async function isBookmarked(idb, target) {
  const record = await idb.get('userdata', `bookmark:${target}`);
  return record !== null && record.fields.deleted !== true;
}

/** Adds or removes a bookmark. Returns true when the target is now bookmarked. */
export async function toggleBookmark({ idb, target, now = Date.now() }) {
  const was = await isBookmarked(idb, target);
  await idb.setFields('userdata', `bookmark:${target}`, { target, deleted: was }, now);
  return !was;
}

export const listBookmarks = (idb) => listPrefix(idb, 'bookmark:');

// ── projects and reading lists ─────────────────────────────────────────────────

export async function createProject({ idb, title, question = '', kind = 'project', now = Date.now(), id = newId() }) {
  if (!PROJECT_KINDS.includes(kind)) throw new Error(`Unknown project kind ${kind}.`);
  const key = `project:${id}`;
  await idb.setFields('userdata', key, { title, question, kind, deleted: false }, now);
  return key;
}

export const updateProject = ({ idb, key, fields, now = Date.now() }) => idb.setFields('userdata', key, fields, now);
export const deleteProject = ({ idb, key, now = Date.now() }) => idb.setFields('userdata', key, { deleted: true }, now);
export const listProjects = (idb) =>
  listPrefix(idb, 'project:').then((l) => l.sort((a, b) => a.fields.title.localeCompare(b.fields.title)));

const itemKey = (projectKey, target) => `projitem:${projectKey.slice('project:'.length)}|${target}`;

/** Adds a record, claim, argument or any target to a project. The same target can be in several projects. */
export async function addToProject({ idb, projectKey, target, now = Date.now() }) {
  const existing = await idb.get('userdata', itemKey(projectKey, target));
  const order = existing?.fields?.order ?? (await projectItems(idb, projectKey)).length;
  await idb.setFields(
    'userdata',
    itemKey(projectKey, target),
    { project: projectKey, target, order, deleted: false },
    now,
  );
}

export const removeFromProject = ({ idb, projectKey, target, now = Date.now() }) =>
  idb.setFields('userdata', itemKey(projectKey, target), { deleted: true }, now);

export async function projectItems(idb, projectKey) {
  const items = await listPrefix(idb, 'projitem:');
  return items.filter((i) => i.fields.project === projectKey).sort((a, b) => a.fields.order - b.fields.order);
}

/** The projects that contain a target. */
export async function projectsContaining(idb, target) {
  const keys = new Set(
    (await listPrefix(idb, 'projitem:')).filter((i) => i.fields.target === target).map((i) => i.fields.project),
  );
  return (await listProjects(idb)).filter((p) => keys.has(p.key));
}

// ── learning progress ──────────────────────────────────────────────────────────

export async function setProgress({ idb, target, state, now = Date.now() }) {
  if (!PROGRESS_STATES.includes(state)) throw new Error(`Unknown progress state ${state}.`);
  await idb.setFields('userdata', `progress:${target}`, { target, state }, now);
}

export async function getProgress(idb, target) {
  return (await idb.get('userdata', `progress:${target}`))?.fields?.state ?? 'unread';
}

export const listProgress = (idb) => listPrefix(idb, 'progress:');

/** Removes every workspace record for good ("delete all my data"). Returns how many were removed. */
export async function deleteEverything(idb) {
  const keys = await idb.keys('userdata');
  for (const key of keys) await idb.delete('userdata', key);
  return keys.length;
}

// ── targets ────────────────────────────────────────────────────────────────────

/**
 * What a note or bookmark points at, now. `exists` is false when the target is gone from the current collection (a claim that
 * was removed in an update, for example); the note is then shown with a clear message, never lost.
 */
export function resolveTarget(data, target) {
  const found = data.resolve(target);
  return {
    exists: found !== null,
    kind: found?.kind ?? null,
    title: found === null ? target : data.titleOf(target),
    path: found === null ? null : data.pathOf(target),
    reference: referenceOf(target),
  };
}

/** `ODonovan1996-desire-ch05 · claim 3` for a claim id; the id itself for anything else. */
export function referenceOf(id) {
  const m = /^(.+)#c(\d+)$/.exec(id);
  if (m !== null) return `${m[1]} · claim ${m[2]}`;
  const q = /^(.+)#q(\d+)$/.exec(id);
  if (q !== null) return `${q[1]} · quotation ${q[2]}`;
  return id;
}
