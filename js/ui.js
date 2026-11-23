// Small DOM helpers shared by the pages: element builder, badges, links, and the typed Related lists.
// Everything is built with DOM methods and textContent; record text goes through renderText (sanitised).

import { inlineMarkup } from './format-text.js';

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
export function badge(doc, t, kind, value) {
  const label = t(`badge_${kind}_${value}`);
  const glyph =
    kind === 'status' && GLYPH[value]
      ? el(doc, 'span', { 'aria-hidden': 'true', class: 'glyph', text: `${GLYPH[value]} ` })
      : null;
  return el(
    doc,
    'span',
    { class: `badge badge-${kind} badge-${kind}-${value}`, 'data-kind': kind, 'data-value': value },
    glyph,
    label,
  );
}

export const aiBadge = (doc, t) =>
  el(doc, 'span', { class: 'badge badge-ai', 'data-kind': 'ai' }, t('badge_ai_assisted'));

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
    section.append(el(doc, `h${headingLevel + 1}`, { text: ctx.t(`rel_${group.reading}`) }));
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
