// Finding the titles of works and the names of people in a sentence, so that they can be linked when it is shown. Nothing is stored and no record is changed.
// Only a clear match is a link:
//   - the full title, or its main title (before a colon or question mark), written with the same capitals;
//   - a leading "The" may be left out; "A" or "An" must be written as in the title, and another article is another title;
//   - at least two words, so that a one-word title ("Ethics") is never picked out of ordinary prose;
//   - one work only: where several share the form, the single book among them; otherwise none;
//   - in italics (*…*), only a span that is the whole title, so a title inside a longer title is left alone;
//   - in record text, only italics are linked, and only to works published on their own (an italic journal name is not an article);
//     a two-word title there is common property ("Systematic Theology"), so it also needs the work's author named beside it.
// An editorial entry may name further forms itself (`links: { written form: source id }`), which come first.

const ARTICLE = /^(?:The|A|An|the|a|an) /;
const BOOK = /^(?:book(?! chapter)|edited volume|sourcebook)/;
// Types of work that stand on their own, so that italics can mean them.
const STANDALONE = /^(?:book(?! chapter)|edited volume|sourcebook|thesis|doctoral|lecture)/;
const plain = (text) => String(text).replace(/[‘’]/g, "'");
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const articleOf = (text) => (ARTICLE.exec(text)?.[0] ?? '').trim().toLowerCase();

/**
 * The forms a source can be written in, from [{ id, title, type }]: a Map of form (without a leading article) ->
 * { id, article } (the article of the title, lower case, or '').
 */
export function titleIndex(works) {
  const found = new Map();
  const add = (form, work, full) => {
    const written = plain(form).replace(/\*/g, '').trim();
    const key = written.replace(ARTICLE, '');
    if (key.split(/\s+/).length < 2) return;
    if (!found.has(key)) found.set(key, new Map());
    const entry = found.get(key);
    entry.set(work.id, { work, article: articleOf(written), full: full || (entry.get(work.id)?.full ?? false) });
  };
  for (const work of works) {
    if (!work.title) continue;
    add(work.title, work, true);
    const main = work.title.split(/(?::|(?<=\?)) /)[0];
    if (main !== work.title) add(main, work, false);
    // "Begotten or Made?" is also written without its question mark.
    if (main.endsWith('?')) add(main.slice(0, -1), work, false);
  }
  const index = new Map();
  for (const [key, entry] of found) {
    const all = [...entry.values()];
    const books = all.filter((c) => BOOK.test(c.work.type ?? ''));
    const one = all.length === 1 ? all : books.length === 1 ? books : [];
    if (one.length === 1) index.set(key, { id: one[0].work.id, article: one[0].article });
  }
  return index;
}

/** The index for record text: works published on their own. */
export const recordTitleIndex = (works) => titleIndex(works.filter((w) => STANDALONE.test(w.type ?? '')));

/**
 * The source a written form means, or null. A written article must be the title's own, except that "The" may be left out. In running
 * text a lower-case article before a title that has none is ordinary prose; in italics it makes another title.
 */
export function titleFor(written, index, italic = false) {
  const form = plain(written);
  const entry = index.get(form.replace(ARTICLE, ''));
  if (entry === undefined) return null;
  const article = articleOf(form);
  if (article === entry.article) return entry.id;
  if (article === '') return entry.article === 'the' ? entry.id : null;
  return entry.article === '' && !italic ? entry.id : null;
}

/**
 * Whether record text beside an italic title bears it out: a title of two words (besides its article) needs the surname of one of the
 * work's creators in the same passage.
 */
export function borneOut(written, passage, creators = []) {
  if (plain(written).trim().replace(ARTICLE, '').split(/\s+/).length > 2) return true;
  const text = plain(passage);
  return creators.some((c) => {
    const surname = plain(c.name ?? c.display_name ?? '')
      .trim()
      .split(/\s+/)
      .at(-1);
    return surname !== '' && new RegExp(`(?<!\\p{L})${escapeRegExp(surname)}(?!\\p{L})`, 'u').test(text);
  });
}

/**
 * The collection's own short forms, from [{ form, as, source }]: `italic` maps every form that may stand as a whole italic span to its
 * source; `split` cuts plain text at the abbreviations ("letters"), giving [{ text, id }].
 */
export function shortIndex(list) {
  const italic = new Map(list.map((s) => [plain(s.form), s.source]));
  const letters = new Map(list.filter((s) => s.as === 'letters').map((s) => [s.form, s.source]));
  const keys = [...letters.keys()].sort((a, b) => b.length - a.length);
  const pattern = keys.length
    ? new RegExp(`(?<![\\p{L}\\p{N}&.-])(${keys.map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}&])`, 'u')
    : null;
  const split = (text) =>
    (pattern ? String(text).split(pattern) : [String(text)])
      .map((part, i) => ({ text: part, id: i % 2 === 1 ? letters.get(part) : null }))
      .filter((s) => s.text !== '');
  return { italic: (written) => italic.get(plain(written)) ?? null, split };
}

// A surname with its particle ("de Lubac", "Van Dyk") is still only a surname.
const PARTICLE = /^(?:\p{Ll}|(?:Van|Von|De|Du|Le|La|Den|Der) \S+$)/u;
// What follows a name that is only the start of a longer one ("Martin Luther King", "John Knox Press", "John Paul II").
const LONGER = /^(?:-\p{L}| \p{Lu}\p{Ll}| [IVXL]+(?!\p{L}))/u;
// The publisher Westminster John Knox is not the reformer.
const PUBLISHER = /Westminster ?\/? ?$/;

/**
 * Full names of people, from [{ id, name, display_name, variants, kind }] (D93). Only a form of two words or more that means one person
 * is used, never a surname alone, and bodies are left out. `split(text, seen)` gives [{ text, id }], linking the first mention of each
 * person not already in `seen` (which it adds to).
 */
export function nameIndex(people) {
  const found = new Map();
  for (const person of people) {
    if (person.kind === 'body') continue;
    for (const form of [person.name, person.display_name, ...(person.variants ?? [])]) {
      const key = plain(form ?? '').trim();
      if (key.split(/\s+/).length < 2 || PARTICLE.test(key)) continue;
      if (!found.has(key)) found.set(key, new Set());
      found.get(key).add(person.id);
    }
  }
  const keys = [...found.keys()].sort((a, b) => b.length - a.length);
  const pattern = keys.length
    ? new RegExp(`(?<![\\p{L}\\p{N}-])(?:${keys.map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}])`, 'gu')
    : null;
  const split = (text, seen = new Set()) => {
    const whole = String(text);
    const alike = plain(whole);
    const out = [];
    let from = 0;
    for (const match of pattern ? alike.matchAll(pattern) : []) {
      const ids = found.get(match[0]);
      const [id] = ids;
      const end = match.index + match[0].length;
      if (ids.size > 1 || seen.has(id)) continue;
      if (LONGER.test(alike.slice(end)) || PUBLISHER.test(alike.slice(0, match.index))) continue;
      seen.add(id);
      out.push({ text: whole.slice(from, match.index), id: null }, { text: whole.slice(match.index, end), id });
      from = end;
    }
    out.push({ text: whole.slice(from), id: null });
    return out.filter((s) => s.text !== '');
  };
  return { split };
}

/**
 * Splits text into [{ text, id }]: `id` is the source to link to, or null for ordinary text (which may still carry *italics*). `forms`
 * are the entry's own written forms.
 */
export function segmentTitles(text, index, forms = {}) {
  const own = new Map(Object.entries(forms ?? {}).map(([form, id]) => [plain(form), id]));
  const lookup = (written, italic = false) =>
    own.get(written) ?? own.get(written.replace(ARTICLE, '')) ?? titleFor(written, index, italic);
  const keys = [...own.keys(), ...index.keys()].sort((a, b) => b.length - a.length);
  const pattern = keys.length
    ? new RegExp(
        `(?<![\\p{L}\\p{N}])(?:(?:The|A|An|the|a|an) )?(?:${keys.map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}])`,
        'gu',
      )
    : null;
  const out = [];
  const push = (part, id = null) => {
    if (part === '') return;
    if (id === null && out.length > 0 && out.at(-1).id === null) out.at(-1).text += part;
    else out.push({ text: part, id });
  };
  for (const piece of String(text).split(/(\*[^*\n]+\*)/)) {
    if (/^\*[^*\n]+\*$/.test(piece)) {
      const inner = piece.slice(1, -1);
      const id = lookup(plain(inner), true);
      if (id === null) push(piece);
      else push(inner, id);
      continue;
    }
    let from = 0;
    // Apostrophes are matched alike; each is one character, so positions in the plain copy hold in the original.
    for (const match of pattern ? plain(piece).matchAll(pattern) : []) {
      const id = lookup(match[0]);
      if (id === null) continue;
      // A leading article stays outside the link unless it begins the title as listed.
      const article = own.has(match[0]) ? '' : (ARTICLE.exec(match[0])?.[0] ?? '');
      push(piece.slice(from, match.index + article.length));
      from = match.index + match[0].length;
      push(piece.slice(match.index + article.length, from), id);
    }
    push(piece.slice(from));
  }
  return out;
}
