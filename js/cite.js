// "Cite" (D27): Chicago style (notes and bibliography), two citations: the underlying work, and the platform record. It warns
// when the locators have not been checked against print. This module builds text only.

const PARTICLES = new Set([
  'de',
  'del',
  'della',
  'di',
  'da',
  'du',
  'van',
  'von',
  'der',
  'den',
  'la',
  'le',
  'al',
  'el',
  'bin',
  'ibn',
]);
const SUFFIXES = /^(jr\.?|sr\.?|ii|iii|iv)$/i;

/** "Oliver O’Donovan" becomes "O’Donovan, Oliver"; particles stay with the surname; a suffix stays after the given names. */
export function invertName(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name.trim();
  let suffix = '';
  if (SUFFIXES.test(parts.at(-1))) suffix = parts.pop();
  let start = parts.length - 1;
  while (start > 1 && PARTICLES.has(parts[start - 1].toLowerCase())) start -= 1;
  const given = parts.slice(0, start).join(' ');
  const family = parts.slice(start).join(' ');
  return `${family}, ${given}${suffix ? `, ${suffix}` : ''}`;
}

const names = (list, inverted = true) => {
  const formatted = list.map((c, i) =>
    i === 0 && inverted ? invertName(c.display_name ?? c.name) : (c.display_name ?? c.name),
  );
  if (formatted.length <= 2) return formatted.join(' and ');
  if (formatted.length > 10) return `${formatted.slice(0, 7).join(', ')}, et al.`;
  return `${formatted.slice(0, -1).join(', ')}, and ${formatted.at(-1)}`;
};

const strip = (text) => String(text ?? '').replace(/\*/g, '');
const end = (text) => (/[.?!]$/.test(text) ? text : `${text}.`);
/** A year from a citation's date: a number, a string of digits, or an object with a `year`; otherwise null. */
export function yearOf(value) {
  const found = typeof value === 'object' && value !== null ? value.year : value;
  return (typeof found === 'number' || typeof found === 'string') && /^\d{3,4}$/.test(found) ? Number(found) : null;
}

const year = (citation) => yearOf(citation.dates?.original) ?? yearOf(citation.dates?.year);

function publication(citation) {
  const p = citation.publication ?? {};
  const bits = [p.place, p.publisher_short ?? p.publisher].filter(Boolean);
  const where = bits.length === 2 ? `${bits[0]}: ${bits[1]}` : bits[0];
  return [where, year(citation)].filter(Boolean).join(', ');
}

/**
 * The underlying work as a Chicago bibliography entry. `source` is the pack's source citation; `record` (optional) is a chapter
 * record, which adds its title and number inside the book. Returns plain text.
 */
export function chicagoWork(citation, record = null, { chapterAuthors = [] } = {}) {
  // A citation derived from the record (no structured one exists) is shown as the record prints it, never reformatted.
  if (citation.derived === true && typeof citation.printed === 'string') return strip(citation.printed);
  const authors = (citation.creators ?? []).filter((c) => ['author', 'editor'].includes(c.role));
  const isEdited = authors.length > 0 && authors.every((c) => c.role === 'editor');
  const who = authors.length > 0 ? `${names(authors)}${isEdited ? (authors.length > 1 ? ', eds' : ', ed') : ''}.` : '';
  const title = strip(citation.title);
  const subtitle = citation.subtitle ? `: ${strip(citation.subtitle)}` : '';
  const container = citation.container ?? null;

  if (record !== null && record.key !== citation.id && record.title) {
    const chapter = `“${strip(record.title)}.”`;
    const chapterAuthor =
      chapterAuthors.length > 0 ? `${names(chapterAuthors.map((name) => ({ name })))}.` : isEdited ? '' : who;
    return [
      chapterAuthor,
      chapter,
      `In ${title}${subtitle}${isEdited ? `, edited by ${names(authors, false)}` : ''},`,
      `${publication(citation)}.`,
    ]
      .filter(Boolean)
      .join(' ');
  }
  switch (citation.type) {
    case 'article':
    case 'review': {
      const journal = container
        ? `${strip(container.title)}${container.volume ? ` ${container.volume}` : ''}${container.issue ? `, no. ${container.issue}` : ''}`
        : '';
      const pages = citation.pages ?? container?.pages;
      const doi = citation.identifiers?.doi ? ` https://doi.org/${citation.identifiers.doi}.` : '';
      // A review with no title of its own is cited as "Review of Title, by Author" (Chicago), never with an empty pair of quotation marks.
      const reviewed = (citation.reviewed_works ?? []).filter((w) => w?.title);
      if (citation.type === 'review' && title === '' && reviewed.length > 0) {
        const of = reviewed.map((w) => `${strip(w.title)}${w.author ? `, by ${strip(w.author)}` : ''}`).join('; ');
        return `${who} Review of ${of}. ${journal}${year(citation) ? ` (${year(citation)})` : ''}${pages ? `: ${pages}` : ''}.${doi}`
          .replace(/\s+/g, ' ')
          .trim();
      }
      return `${who} “${title}${subtitle}.” ${journal}${year(citation) ? ` (${year(citation)})` : ''}${pages ? `: ${pages}` : ''}.${doi}`
        .replace(/\s+/g, ' ')
        .trim();
    }
    case 'thesis': {
      const t = citation.thesis ?? {};
      return `${who} “${title}${subtitle}.” ${[t.degree, t.institution, year(citation)].filter(Boolean).join(', ')}.`
        .replace(/\s+/g, ' ')
        .trim();
    }
    case 'web_page':
      return `${who} “${title}.” ${year(citation) ?? ''}`.replace(/\s+/g, ' ').trim();
    default:
      return `${who} ${end(`${title}${subtitle}`)} ${publication(citation)}.`.replace(/\s+/g, ' ').trim();
  }
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
export const longDate = (date) => `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;

/** The platform record: this collection's own page, with the collection version and the date it was read. */
export function chicagoPlatform({ title, collectionVersion, url, accessed, appName = 'Theology Research Reader' }) {
  return `${appName}. “${strip(title)}.” Collection version ${collectionVersion}. Accessed ${longDate(accessed)}. ${url}.`;
}

/**
 * True when a warning is needed: page numbers or quotations on this record have not been checked against print. The verification
 * object is the pack's derived label (`quotations`, `pages`). Both must be print-checked/checked for the warning to go away.
 */
export function needsLocatorWarning(verification) {
  return !(verification?.quotations === 'print_checked' && verification?.pages === 'checked');
}
