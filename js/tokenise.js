// The one tokeniser, used by the build (to make the search index) and by the app (to read a query). They must agree, so the
// build imports this file. Lower-case, accents removed, split on anything that is not a letter or digit; one-letter tokens
// and a few very common words are dropped.

const STOP = new Set([
  'the',
  'of',
  'and',
  'in',
  'to',
  'a',
  'is',
  'for',
  'on',
  'as',
  'by',
  'an',
  'at',
  'it',
  'its',
  'or',
]);

export function tokenise(text) {
  return String(text)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/** The same normalisation for a whole phrase, with the stop words kept (used to compare titles and variants). */
export const normalisePhrase = (text) =>
  String(text)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
