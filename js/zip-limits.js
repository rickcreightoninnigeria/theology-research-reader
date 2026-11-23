// Limits on zip files that come from outside (the collection download and backup restore). They guard against a zip bomb
// (huge or highly compressed entries) and against names that climb out of the folder (path traversal). The numbers follow
// the Bible Study Reader's.

export const ZIP_MAX_ENTRIES = 200;
export const ZIP_MAX_ENTRY_BYTES = 25 * 1024 * 1024;
export const ZIP_MAX_TOTAL_BYTES = 150 * 1024 * 1024;
export const ZIP_MAX_RATIO = 100; // uncompressed : compressed
export const ZIP_RATIO_MIN_BYTES = 1024 * 1024; // the ratio is ignored for small entries

/** True for a plain relative name made of safe segments. Rejects "..", absolute paths, backslashes and control characters. */
export function isSafeEntryName(name) {
  if (typeof name !== 'string' || name === '' || name.length > 255) return false;
  if (name.startsWith('/') || name.includes('\\') || [...name].some((ch) => ch.charCodeAt(0) < 32)) return false;
  if (/^[a-zA-Z]:/.test(name)) return false;
  return name
    .split('/')
    .every((part, index, parts) => part !== '..' && part !== '.' && (part !== '' || index === parts.length - 1));
}

/**
 * Checks the entries of an opened zip (from JSZip's `zip.files`) before anything is read. Throws an Error with a reason
 * code in `error.code` (too_many_entries, unsafe_name, entry_too_large, total_too_large, ratio_too_high).
 */
export function assertZipSafe(files, limits = {}) {
  const max = {
    entries: ZIP_MAX_ENTRIES,
    entryBytes: ZIP_MAX_ENTRY_BYTES,
    totalBytes: ZIP_MAX_TOTAL_BYTES,
    ratio: ZIP_MAX_RATIO,
    ratioMinBytes: ZIP_RATIO_MIN_BYTES,
    ...limits,
  };
  const entries = Object.values(files);
  const fail = (code, message) => Object.assign(new Error(message), { code });
  if (entries.length > max.entries)
    throw fail('too_many_entries', `The zip has ${entries.length} entries; the limit is ${max.entries}.`);
  let total = 0;
  for (const entry of entries) {
    if (!isSafeEntryName(entry.name))
      throw fail('unsafe_name', `The zip has an unsafe file name: ${JSON.stringify(entry.name)}.`);
    if (entry.dir) continue;
    const size = entry._data?.uncompressedSize ?? 0;
    const compressed = entry._data?.compressedSize ?? 0;
    total += size;
    if (size > max.entryBytes) throw fail('entry_too_large', `${entry.name} is larger than the limit.`);
    if (total > max.totalBytes) throw fail('total_too_large', 'The zip is larger than the total limit.');
    if (size > max.ratioMinBytes && size > compressed * max.ratio) {
      throw fail('ratio_too_high', `${entry.name} is compressed far more than normal text.`);
    }
  }
}

/** Reads one entry as text and checks the real size, which the header may have understated. */
export async function readEntryText(zip, name, limits = {}) {
  const file = zip.file(name);
  if (file === null) throw Object.assign(new Error(`${name} is missing from the zip.`), { code: 'missing_entry' });
  const text = await file.async('string');
  const maxBytes = limits.entryBytes ?? ZIP_MAX_ENTRY_BYTES;
  if (new TextEncoder().encode(text).length > maxBytes) {
    throw Object.assign(new Error(`${name} is larger than the limit.`), { code: 'entry_too_large' });
  }
  return text;
}
