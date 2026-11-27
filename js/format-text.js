// Turning record text into safe HTML. Record text carries only light markup: *italic* and paragraph breaks. The text is
// escaped first, the small markup is applied, and the result goes through DOMPurify as a second line of defence.
// Nothing in the app puts un-sanitised text into innerHTML.

import DOMPurify from './vendor/purify.es.mjs';

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escaped text with *italic* turned into <em>. */
export function inlineMarkup(text) {
  return escapeHtml(text).replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
}

const PURIFY_CONFIG = {
  ALLOWED_TAGS: ['em', 'strong', 'p', 'br', 'a', 'ul', 'ol', 'li', 'blockquote'],
  ALLOWED_ATTR: ['href'],
  ALLOW_DATA_ATTR: false,
};

/** Sanitises an HTML string. Only https links survive. */
export function sanitizeHtml(html, purifier = DOMPurify) {
  return purifier.sanitize(html, { ...PURIFY_CONFIG, ALLOWED_URI_REGEXP: /^https:/i });
}

/** Record text as safe paragraphs of HTML. */
export function renderText(text, purifier = DOMPurify) {
  const paragraphs = String(text)
    .split(/\n{2,}/)
    .map((p) => `<p>${inlineMarkup(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  return sanitizeHtml(paragraphs, purifier);
}

// ---------- fields that are really lists ----------

const NUMBERED = /^\s*(\d{1,3})[.)]\s+(.*)$/;
const BULLETED = /^\s*[-•]\s+(.*)$/;

/** Splits at `;` outside brackets and quotation marks, so a parenthetical or a quoted title keeps its own semicolons. */
export function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let quote = 0;
  let current = '';
  for (const ch of text) {
    if ('([{'.includes(ch)) depth += 1;
    else if (')]}'.includes(ch)) depth = Math.max(0, depth - 1);
    else if ('“‘'.includes(ch)) quote += 1;
    else if ('”’'.includes(ch)) quote = Math.max(0, quote - 1);
    if (ch === ';' && depth === 0 && quote === 0) {
      parts.push(current.trim());
      current = '';
    } else current += ch;
  }
  if (current.trim() !== '') parts.push(current.trim());
  return parts.filter(Boolean);
}

// Fields whose value is a run of items separated by semicolons. Other fields are left as prose.
const SEMICOLON_LISTS = /^(Positions and debates engaged|Leads)\b/i;

const items = (tag, list, attrs = '') =>
  `<${tag}${attrs}>${list.map((i) => `<li>${inlineMarkup(i)}</li>`).join('')}</${tag}>`;

/**
 * A field's value as safe HTML. A numbered run ("1. … 2. …") becomes an ordered list and a bulleted run an unordered one, whatever the
 * field. In "Positions and debates engaged" and "Leads" a single paragraph of items separated by semicolons becomes an unordered list
 * (a closing "all as cited" stays as a note under it). Anything else is paragraphs, as before. The words are never changed.
 */
export function renderFieldText(name, text, purifier = DOMPurify) {
  const lines = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
    .split('\n');
  const numbered = lines.filter((l) => NUMBERED.test(l)).length;
  const bulleted = lines.filter((l) => BULLETED.test(l)).length;
  if (numbered >= 1 && NUMBERED.test(lines[0])) {
    const list = [];
    for (const line of lines) {
      const m = NUMBERED.exec(line);
      if (m) list.push(m[2].trim());
      else if (list.length > 0 && line.trim() !== '') list[list.length - 1] += ` ${line.trim()}`;
    }
    const start = Number(NUMBERED.exec(lines[0])[1]);
    return sanitizeHtml(items('ol', list, start === 1 ? '' : ` start="${start}"`), purifier);
  }
  if (bulleted >= 1 && BULLETED.test(lines[0])) {
    const list = [];
    for (const line of lines) {
      const m = BULLETED.exec(line);
      if (m) list.push(m[1].trim());
      else if (list.length > 0 && line.trim() !== '') list[list.length - 1] += ` ${line.trim()}`;
    }
    return sanitizeHtml(items('ul', list), purifier);
  }
  if (SEMICOLON_LISTS.test(name) && lines.length === 1) {
    let parts = splitTopLevel(lines[0]);
    if (parts.length >= 2) {
      let note = '';
      const last = parts.at(-1);
      const tail = /,?\s*(all as cited)\.?$/i.exec(last);
      if (tail) {
        parts[parts.length - 1] = last.slice(0, tail.index).trim();
        note = `<p>${escapeHtml(tail[1])}</p>`;
      }
      parts = parts.map((p, i) => (i === parts.length - 1 ? p.replace(/\.$/, '') : p));
      return sanitizeHtml(`${items('ul', parts)}${note}`, purifier);
    }
  }
  return renderText(text, purifier);
}

// The stock reminder the records attach to quotation after quotation. The page says it once, above the list. Only the bare reminder goes:
// "check against print for the italics" says something more and stays.
// It is bare when it ends there, or a new sentence follows.
const STOCK = /(?:\b(?:Both|All)\s*:\s*)?\*?[Cc]heck against print\*?(?=\s*(?:[.;,)\]]|$)|\s+[A-Z](?:[a-z]|\s))/g;

/** Text without the stock reminder, and without the punctuation that held it. */
const withoutStock = (value) =>
  String(value ?? '')
    .replace(STOCK, '')
    .replace(/\(\s*[;,–—-]*\s*\)/g, '')
    .replace(/\(\s*[;,]\s*/g, '(')
    .replace(/\s*[;,–—-]+\s*(?=[).\]])/g, '')
    .replace(/;(?:\s*;)+/g, ';')
    .replace(/(?:\s*\.){2,}/g, '.')
    .trim()
    .replace(/[\s;,–—-]+$/, '');

/** A quotation's page reference without the stock reminder some records put inside it ("p. 90; check against print" is "p. 90"). */
export const locatorText = (q) => withoutStock(q.locator);

/**
 * What a quotation's caveat adds: without the locator it repeats and without the stock "check against print" ("(p. 13). Both: check
 * against print." says nothing more; "fifth paragraph – check against print" leaves "fifth paragraph"). '' when nothing is left.
 */
export function caveatText(q) {
  let text = withoutStock(q.caveat);
  const locator = locatorText(q)
    .replace(/^\(|\)$/g, '')
    .trim();
  for (const form of [locator, `(${locator})`]) {
    if (form !== '' && text.startsWith(form)) text = text.slice(form.length);
  }
  text = text
    .replace(/^[\s.;,:–—-]+/, '')
    .replace(/[\s;,:–—-]+$/, '')
    .trim();
  return /[\p{L}\p{N}]/u.test(text) ? text : '';
}
