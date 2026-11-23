// "Report a problem or suggest a correction" (D24): a prefilled message with the record key, the collection version and the
// reader's own words. Nothing is sent by the app: the reader copies the message or opens it in their own mail program.

/** The message text. `free` is what the reader typed (it may be empty). */
export function buildReportMessage({ key, title, collectionVersion, appVersion, free = '' }) {
  return [
    'Theology Research Reader: report a problem or suggest a correction',
    '',
    `Record: ${key}`,
    title ? `Title: ${title}` : null,
    `Collection version: ${collectionVersion}`,
    `App version: ${appVersion}`,
    '',
    'What I noticed or suggest:',
    free.trim() === '' ? '' : free.trim(),
  ]
    .filter((line) => line !== null)
    .join('\n');
}

/** A mailto link, or null when no contact address has been set. */
export function reportMailto(address, subject, body) {
  if (typeof address !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return null;
  return `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
