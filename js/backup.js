// Backup and restore of the reader's own data as a zip (`.clbackup`), in the style of the Bible Study Reader.
// A backup holds the user records (notes, and later answers and positions) and the settings. Restoring MERGES: it keeps
// the newer copy of each field by its timestamp and never removes anything. The collection itself is not in a backup:
// it is downloaded again. Zip limits and name checks apply to anything that is opened (restore).

import { mergeRecords } from './idb.js';
import { assertZipSafe, isSafeEntryName, readEntryText } from './zip-limits.js';

export const BACKUP_FORMAT = 1;
export const BACKUP_FILE = 'clbackup.json';
export const BACKUP_EXTENSION = '.clbackup';

/** Builds a backup zip as bytes. */
export async function buildBackup({ idb, JSZip, settings = {}, now = () => new Date().toISOString() }) {
  const records = {};
  for (const key of await idb.keys('userdata')) records[key] = await idb.get('userdata', key);
  const zip = new JSZip();
  zip.file(BACKUP_FILE, JSON.stringify({ format: BACKUP_FORMAT, createdAt: now(), records, settings }, null, 1), {
    date: new Date(0),
  });
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

/** True when the bytes look like a zip (the first bytes of every zip file). */
export function looksLikeZip(bytes) {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

/**
 * Restores a backup by merging. Returns { merged, added, settings } and throws an Error with `code` when the file is not a
 * safe backup (not_a_backup, too_many_entries, unsafe_name, entry_too_large, total_too_large, ratio_too_high, bad_format).
 */
export async function restoreBackup({ idb, JSZip, bytes }) {
  if (!looksLikeZip(bytes)) throw Object.assign(new Error('This is not a backup file.'), { code: 'not_a_backup' });
  const zip = await JSZip.loadAsync(bytes);
  assertZipSafe(zip.files);
  for (const name of Object.keys(zip.files)) {
    if (name !== BACKUP_FILE && !isSafeEntryName(name))
      throw Object.assign(new Error('Unsafe name in backup.'), { code: 'unsafe_name' });
  }
  let data;
  try {
    data = JSON.parse(await readEntryText(zip, BACKUP_FILE));
  } catch (error) {
    if (error.code === 'missing_entry')
      throw Object.assign(new Error('This is not a backup file.'), { code: 'not_a_backup' });
    throw Object.assign(new Error('The backup could not be read.'), { code: 'bad_format' });
  }
  if (data.format !== BACKUP_FORMAT || typeof data.records !== 'object' || data.records === null) {
    throw Object.assign(new Error('This backup is from an unknown version.'), { code: 'bad_format' });
  }
  let merged = 0;
  let added = 0;
  for (const [key, incoming] of Object.entries(data.records)) {
    if (typeof incoming !== 'object' || incoming === null || typeof incoming.fields !== 'object') continue;
    let existed = true;
    await idb.update('userdata', key, (current) => {
      existed = current !== null;
      return mergeRecords(current, incoming);
    });
    if (existed) merged += 1;
    else added += 1;
  }
  return { merged, added, settings: data.settings ?? {} };
}
