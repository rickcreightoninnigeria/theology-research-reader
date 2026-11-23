// Offline full-text search over the pack's index (D22). Pure: no DOM, no network.
//
// MATCHING. A query is split into words (the same tokeniser the build used). A document matches when it contains every word
// (the last word may be a prefix, so results appear as you type). A document also matches when it carries a tag that the query
// maps to through the tag list's "use X, not Y" rules (variants), so a search for a variant finds records tagged with the
// preferred term.
//
// RANKING (higher first; documented here and tested in tests/search.test.js):
//   1000  the query is exactly the record key (or source key)
//    900  the query is exactly the title
//    700  the title contains the whole query as a phrase
//    500  every query word is in the title
//     20  for each query word found in a summary or main claim
//      5  for each query word found only in other fields (tags, quotations, headings)
//     50  a match by variant tag only (no query word found)
//  Ties keep the index order (sources, then records, then arguments and concepts, then people, each by key).
//
// FACETS. Counts are given for publication type, author, tag, concept, period, source role and verification; the counts for one
// facet ignore that facet's own selection, so the reader can widen it. Only tags on the configured tag list are offered as
// facets (D35); every tag stays searchable as text. The VERIFICATION FILTER is off by default; when it is on it leaves out
// records whose quotations are `unchecked`, and nothing else.

import { normalisePhrase, tokenise } from './tokenise.js';

export const FACETS = ['type', 'author', 'tag', 'concept', 'period', 'role', 'verification'];
const PREFIX_LIMIT = 40;

export function createSearch({ index, variants = {} }) {
  const { docs, terms, titleTerms, textTerms } = index;
  const listedTags = new Set(index.listedTags ?? []);
  let vocabulary = null;
  const sets = new Map();
  // A posting list as a Set, made once per word: ranking asks "is this document in the list?" for every candidate.
  const setOf = (map, name, word) => {
    const key = `${name}\u0000${word}`;
    if (!sets.has(key)) sets.set(key, new Set(map[word] ?? []));
    return sets.get(key);
  };

  const vocab = () => (vocabulary ??= Object.keys(terms));

  /** Posting lists for a word; a prefix word is the union of the words that start with it. */
  function postings(word, prefix) {
    if (!prefix) return terms[word] ?? [];
    const list = vocab();
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid] < word) lo = mid + 1;
      else hi = mid;
    }
    const merged = new Set();
    for (
      let i = lo, taken = 0;
      i < list.length && list[i].startsWith(word) && taken < PREFIX_LIMIT;
      i += 1, taken += 1
    ) {
      for (const d of terms[list[i]]) merged.add(d);
    }
    return [...merged];
  }

  /** Tags that the query maps to through the variant rules (any 1 to 4 word part of the query). */
  function variantTags(phrase) {
    const words = phrase.split(' ').filter(Boolean);
    const found = new Set();
    for (let size = 1; size <= Math.min(4, words.length); size += 1) {
      for (let start = 0; start + size <= words.length; start += 1) {
        const preferred = variants[words.slice(start, start + size).join(' ')];
        if (preferred !== undefined) found.add(preferred);
      }
    }
    return [...found];
  }

  function matchSet(query) {
    const phrase = normalisePhrase(query);
    const words = tokenise(query);
    const expanded = variantTags(phrase);
    if (words.length === 0) return { phrase, words, expanded, matches: null };
    // The last word is a prefix only when the query does not end in a space.
    const lastIsPrefix = !/\s$/.test(query) && words.at(-1).length >= 2;
    let current = null;
    words.forEach((word, i) => {
      const list = postings(word, i === words.length - 1 && lastIsPrefix);
      current = current === null ? new Set(list) : new Set(list.filter((d) => current.has(d)));
    });
    return { phrase, words, expanded, matches: current };
  }

  function score(doc, index, { phrase, words }, viaWords) {
    if (!viaWords) return 50;
    let total = 0;
    if (phrase === normalisePhrase(doc.id)) total += 1000;
    const title = normalisePhrase(doc.title);
    if (phrase === title) total += 900;
    else if (title.includes(phrase)) total += 700;
    if (words.every((w) => setOf(titleTerms, 't', w).has(index))) total += 500;
    for (const w of words) total += setOf(textTerms, 'x', w).has(index) ? 20 : 5;
    return total;
  }

  function passes(doc, filters, skip) {
    for (const facet of FACETS) {
      if (facet === skip) continue;
      const chosen = filters[facet];
      if (!chosen || chosen.length === 0) continue;
      const have = doc.facets?.[facet];
      const values = Array.isArray(have) ? have : have === undefined || have === null ? [] : [have];
      if (!chosen.some((c) => values.includes(c))) return false;
    }
    return !(filters.hideUnchecked === true && doc.facets?.verification === 'unchecked');
  }

  /**
   * Runs a search. `filters` has an array per facet (any of the chosen values) and `hideUnchecked` (the verification filter,
   * false by default). With no query words, results are the documents that pass the filters, but only when a filter is set.
   */
  function search(query, filters = {}, { limit = 50 } = {}) {
    const m = matchSet(query);
    const anyFilter = FACETS.some((f) => filters[f]?.length) || filters.hideUnchecked === true;
    const candidates = [];
    if (m.matches === null) {
      if (!anyFilter && m.expanded.length === 0)
        return { results: [], total: 0, facets: emptyFacets(), expandedTags: [], query: m };
      docs.forEach((doc, i) => candidates.push([i, false]));
    } else {
      for (const i of m.matches) candidates.push([i, true]);
      if (m.expanded.length > 0) {
        const have = new Set(m.matches);
        docs.forEach((doc, i) => {
          if (!have.has(i) && (doc.facets?.tag ?? []).some((t) => m.expanded.includes(t))) candidates.push([i, false]);
        });
      }
    }
    if (m.matches === null && m.expanded.length > 0 && !anyFilter) {
      // The query is only a variant phrase: show the records tagged with the preferred term.
      candidates.length = 0;
      docs.forEach((doc, i) => {
        if ((doc.facets?.tag ?? []).some((t) => m.expanded.includes(t))) candidates.push([i, false]);
      });
    }

    const facets = emptyFacets();
    const kept = [];
    for (const [i, viaWords] of candidates) {
      const doc = docs[i];
      for (const facet of FACETS) {
        if (!passes(doc, filters, facet)) continue;
        const have = doc.facets?.[facet];
        for (const value of Array.isArray(have) ? have : have === undefined || have === null ? [] : [have]) {
          if (facet === 'tag' && !listedTags.has(value)) continue;
          facets[facet][value] = (facets[facet][value] ?? 0) + 1;
        }
      }
      if (passes(doc, filters, null))
        kept.push({ doc, index: i, score: score(doc, i, m, viaWords && m.matches !== null) });
    }
    kept.sort((a, b) => b.score - a.score || a.index - b.index);
    return { results: kept.slice(0, limit), total: kept.length, facets, expandedTags: m.expanded, query: m };
  }

  const emptyFacets = () => Object.fromEntries(FACETS.map((f) => [f, {}]));
  return { search, variantTags };
}
