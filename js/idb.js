// IndexedDB storage layer (ported from the Bible Study Reader, rewritten as an ES module with an injectable factory so it
// can be tested). Two ideas carry over:
//   - read-modify-write happens in ONE readwrite transaction, and calls for the same record are queued, so two quick
//     updates never overwrite each other;
//   - user records keep a timestamp per field (`_t`), so a restore or a second device can keep the newer copy of each field.
//
// Stores
//   packs     collection files, keyed `<version>\0<path>` (value: text)
//   packmeta  one record per installed collection version (keyed by version)
//   meta      pointers and flags: `active`, `pending`
//   userdata  the reader's own data (notes, and later answers and positions), keyed by record id

export const DB_NAME = 'ChristianLibrary';
export const DB_VERSION = 1;
export const STORES = ['packs', 'packmeta', 'meta', 'userdata'];

export function createIdb({ indexedDB: factory = globalThis.indexedDB, name = DB_NAME } = {}) {
  let unavailable = null;
  let opening = null;
  const queues = new Map();

  if (factory === undefined || factory === null) {
    unavailable = Object.assign(new Error('IndexedDB is not available in this browser.'), { name: 'IDBUnavailable' });
  }

  function open() {
    if (unavailable !== null) return Promise.reject(unavailable);
    if (opening !== null) return opening;
    opening = new Promise((resolve, reject) => {
      let request;
      try {
        request = factory.open(name, DB_VERSION);
      } catch (error) {
        unavailable = Object.assign(error, { name: 'IDBUnavailable' });
        opening = null;
        reject(unavailable);
        return;
      }
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const store of STORES) if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          opening = null;
        };
        resolve(db);
      };
      request.onerror = () => {
        unavailable = Object.assign(request.error, { name: 'IDBUnavailable' });
        opening = null;
        reject(unavailable);
      };
    });
    return opening;
  }

  const wrap = (request) =>
    new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

  async function run(storeName, mode, work) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted.'));
      Promise.resolve(work(tx.objectStore(storeName))).then(
        (value) => {
          result = value;
        },
        (error) => {
          reject(error);
          try {
            tx.abort();
          } catch {
            // already finished
          }
        },
      );
    });
  }

  const api = {
    get: (store, key) => run(store, 'readonly', async (s) => (await wrap(s.get(key))) ?? null),
    put: (store, key, value) => run(store, 'readwrite', (s) => wrap(s.put(value, key))),
    delete: (store, key) => run(store, 'readwrite', (s) => wrap(s.delete(key))),
    keys: (store) => run(store, 'readonly', (s) => wrap(s.getAllKeys())),
    count: (store) => run(store, 'readonly', (s) => wrap(s.count())),
    /** Every value whose key starts with `prefix`. */
    valuesWithPrefix: (store, prefix) =>
      run(store, 'readonly', async (s) => {
        const range = IDBKeyRangeFor(prefix);
        return wrap(s.getAll(range));
      }),
    /**
     * Read-modify-write of one record in one transaction. `change(current)` is synchronous and returns the new value
     * (or `undefined` to leave the record alone). Calls for the same record run one after another.
     */
    update(store, key, change) {
      const id = `${store}\u0001${key}`;
      const previous = queues.get(id) ?? Promise.resolve();
      const next = previous
        .catch(() => {})
        .then(() =>
          run(store, 'readwrite', async (s) => {
            const current = (await wrap(s.get(key))) ?? null;
            const value = change(current);
            if (value !== undefined) await wrap(s.put(value, key));
            return value === undefined ? current : value;
          }),
        );
      queues.set(id, next);
      next
        .finally(() => {
          if (queues.get(id) === next) queues.delete(id);
        })
        .catch(() => {});
      return next;
    },
    /** Sets fields of a user record, stamping each with `now`. Fields not named keep their value and stamp. */
    setFields(store, key, fields, now = Date.now()) {
      return api.update(store, key, (current) => applyFields(current, fields, now));
    },
    close: async () => {
      if (opening === null) return;
      (await opening).close();
      opening = null;
    },
  };

  // A key range covering every string that starts with the prefix. Written without IDBKeyRange so it works in any environment
  // that provides the factory (fake-indexeddb installs its own IDBKeyRange globally; browsers have it built in).
  function IDBKeyRangeFor(prefix) {
    return globalThis.IDBKeyRange.bound(prefix, `${prefix}￿`);
  }

  return api;
}

/** A user record is { fields: {name: value}, _t: {name: timestamp} }. */
export function applyFields(current, fields, now) {
  const record = current ?? { fields: {}, _t: {} };
  const next = { fields: { ...record.fields }, _t: { ...record._t } };
  for (const [name, value] of Object.entries(fields)) {
    next.fields[name] = value;
    next._t[name] = now;
  }
  return next;
}

/** Merges two user records, keeping the newer copy of each field (a tie keeps the existing one). Never removes a field. */
export function mergeRecords(existing, incoming) {
  if (existing === null || existing === undefined) return incoming;
  if (incoming === null || incoming === undefined) return existing;
  const merged = { fields: { ...existing.fields }, _t: { ...existing._t } };
  for (const [name, value] of Object.entries(incoming.fields ?? {})) {
    const theirs = incoming._t?.[name] ?? 0;
    const ours = merged._t[name];
    if (ours === undefined || theirs > ours) {
      merged.fields[name] = value;
      merged._t[name] = theirs;
    }
  }
  return merged;
}
