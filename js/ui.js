// Small DOM helpers shared by the pages: element builder, badges, links, and the typed Related lists.
// Everything is built with DOM methods and textContent; record text goes through renderText (sanitised).

import { inlineMarkup } from './format-text.js';
import { coverModel, drawCover } from './cover.js';
import { coverUrl } from './my-library.js';
import { borneOut, nameIndex, recordTitleIndex, shortIndex, titleFor } from './title-links.js';

export const el = (doc, tag, attrs = {}, ...children) => {
  const node = doc.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (name === 'text') node.textContent = value;
    else node.setAttribute(name, value === true ? '' : value);
  }
  node.append(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
  return node;
};

/** Text with *italic* markup as a span (escaped first, then marked up: no raw HTML from data). */
export function richText(doc, text, tag = 'span') {
  const node = doc.createElement(tag);
  node.innerHTML = inlineMarkup(text);
  return node;
}

const textIndexes = new WeakMap();

function indexesFor(data) {
  if (!textIndexes.has(data)) {
    const works = [...data.sources.values()].map((x) => ({
      id: x.id,
      title: x.citation?.title ?? x.displayTitle,
      type: data.records.get(x.id)?.type,
    }));
    const short = shortIndex(data.shortTitles.filter((x) => data.sources.has(x.source)));
    const names = nameIndex([...data.thinkers.values()]);
    textIndexes.set(data, { titles: recordTitleIndex(works), short, names });
  }
  return textIndexes.get(data);
}

/**
 * Links what a piece of record text already on the page names (D93): works by italic title or confirmed short form, and people by full
 * name, the first time each is mentioned in the piece. Only the shown page changes: the words stay as they are and the record is
 * untouched. The work the page belongs to (`own`) is not linked, nor is anything already inside a link.
 */
export function linkMentions(ctx, node, own = null) {
  const { data, doc } = ctx;
  const { titles, short, names } = indexesFor(data);
  const anchor = (id) =>
    el(doc, 'a', {
      href: ctx.href(data.pathOf(id)),
      'data-link': true,
      class: data.thinkers.has(id) ? 'person-link' : 'work-link',
    });
  for (const em of node.querySelectorAll('em')) {
    if (em.closest('a')) continue;
    let id = short.italic(em.textContent);
    if (id === null) {
      id = titleFor(em.textContent, titles, true);
      const passage = (em.closest('li, p, dd') ?? node).textContent;
      if (id !== null && !borneOut(em.textContent, passage, data.sources.get(id).citation?.creators)) id = null;
    }
    if (id === null || id === own) continue;
    const link = anchor(id);
    em.replaceWith(link);
    link.append(em);
  }
  // Abbreviations standing in ordinary text.
  replaceText(doc, node, 'a, button, .badge', anchor, (text) =>
    short.split(text).map((p) => (p.id === own ? { ...p, id: null } : p)),
  );
  // Names, but not inside italics, where they are part of a title.
  const seen = new Set();
  replaceText(doc, node, 'a, button, .badge, em', anchor, (text) => names.split(text, seen));
  return node;
}

/** Replaces each text under `node` (outside `skip`) by its segments, those with an id as links. */
function replaceText(doc, node, skip, anchor, split) {
  const walker = doc.createTreeWalker(node, 4 /* text nodes */);
  const texts = [];
  while (walker.nextNode()) texts.push(walker.currentNode);
  for (const text of texts) {
    if (text.parentElement?.closest(skip)) continue;
    const parts = split(text.data);
    if (!parts.some((p) => p.id !== null)) continue;
    text.replaceWith(
      ...parts.map((p) => {
        if (p.id === null) return p.text;
        const link = anchor(p.id);
        link.textContent = p.text;
        return link;
      }),
    );
  }
}

// The kinds of marker that have a fuller explanation (the "meaning_*" strings), shown as a tooltip on the desktop.
const TIPPED = new Set(['status', 'verification', 'pages', 'state', 'role', 'basis']);

const GLYPH = {
  confirmed: '●',
  editorially_confirmed: '●',
  explicit: '●',
  editorially_identified: '◐',
  suggested: '○',
};

/**
 * A badge always has a text label, so status is never shown by colour alone; `suggested` also has a dashed outline and an open
 * circle. `kind` and `value` pick the label from the locale (badge_<kind>_<value>).
 */
export function badge(doc, t, kind, value, extraTip = null) {
  const label = t(`badge_${kind}_${value}`);
  // The explanation alone: it says what the label says, so giving both would say it twice.
  const base = TIPPED.has(kind) ? t(`meaning_${kind}_${value}`) : kind === 'person' ? label : null;
  const tip = base !== null && extraTip ? `${base} ${extraTip}` : base;
  const glyph =
    kind === 'status' && GLYPH[value]
      ? el(doc, 'span', { 'aria-hidden': 'true', class: 'glyph', text: `${GLYPH[value]} ` })
      : null;
  return el(
    doc,
    'span',
    { class: `badge badge-${kind} badge-${kind}-${value}`, 'data-kind': kind, 'data-value': value, 'data-tip': tip },
    glyph,
    label,
  );
}

export const aiBadge = (doc, t, extraTip = null) =>
  el(
    doc,
    'span',
    {
      class: 'badge badge-ai',
      'data-kind': 'ai',
      'data-tip': extraTip ? `${t('meaning_ai')} ${extraTip}` : t('meaning_ai'),
    },
    t('badge_ai_assisted'),
  );

/** A link to an id's page, or plain text when the id has no page. */
export function linkTo(doc, ctx, id, label = ctx.data.titleOf(id)) {
  const path = ctx.data.pathOf(id);
  if (path === null) return el(doc, 'span', { text: label });
  return el(doc, 'a', { href: ctx.href(path), 'data-link': true }, richText(doc, label));
}

/**
 * The typed Related lists: groups by relationship reading (e.g. "Engages", "Engaged by"), each item with its status badge. A
 * suggested item is labelled as such. Returns null when there is nothing to show.
 */
export function relatedSection(doc, ctx, groups, { headingLevel = 2, title } = {}) {
  const shown = groups.filter((g) => g.items.length > 0);
  if (shown.length === 0) return null;
  const section = el(doc, 'section', { class: 'related', 'aria-labelledby': 'related-heading' });
  section.append(el(doc, `h${headingLevel}`, { id: 'related-heading', text: title ?? ctx.t('related_title') }));
  for (const group of shown) {
    // A group heading that only repeats the section's own title ("Engages" under "Engages") is left out.
    const groupTitle = ctx.t(`rel_${group.reading}`);
    if (groupTitle !== title) {
      section.append(el(doc, `h${headingLevel + 1}`, { text: groupTitle }));
    }
    const list = el(doc, 'ul');
    for (const item of group.items) {
      const record = ctx.data.records.get(item.otherId);
      list.append(
        el(
          doc,
          'li',
          {},
          linkTo(doc, ctx, item.otherId),
          ' ',
          badge(doc, ctx.t, 'status', item.status),
          record?.role ? [' ', badge(doc, ctx.t, 'role', record.role)] : null,
        ),
      );
    }
    section.append(list);
  }
  return section;
}

/** The reader's own book cover (a Calibre cover.jpg) as a small decorative image, or null when there is none. Local server only. */
export function coverImage(ctx, sourceId, className = 'cover') {
  const url = coverUrl(ctx.myLibrary, sourceId, ctx.baseUrl);
  if (url === null) return null;
  const img = el(ctx.doc, 'img', { src: url, alt: '', class: className, loading: 'lazy', decoding: 'async' });
  img.addEventListener('error', () => img.remove());
  return img;
}

/** A page heading with its markers beside it (above it on a phone; the desktop stylesheet puts them side by side). */
export const titleRow = (doc, heading, markers) => el(doc, 'div', { class: 'title-row' }, heading, markers);

/**
 * A source's cover: the reader's own (a Calibre cover.jpg, or a picture of its journal) when there is one; otherwise a generated cover drawn
 * from the record. The generated one is shown by the desktop stylesheet only. Null for something that is not a source.
 */
export function coverOrPlaceholder(ctx, sourceId, className = 'cover') {
  const real = coverImage(ctx, sourceId, className);
  if (real !== null) return real;
  const source = ctx.data?.sources?.get(sourceId);
  if (source === undefined) return null;
  return drawCover(ctx.doc, coverModel(source), ctx.t, `cover-gen ${className}`);
}
