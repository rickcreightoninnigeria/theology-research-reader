// The Thinkers page by relationship to the collection's subject (D90, D92): seven sections built beforehand from the records
// (build/thinkers-page.js) and carried by private packs only. Derived entries are suggestions, and say so; only an entry the owner
// confirmed is marked confirmed. A person the pack does not hold is left out, and an empty section is not shown.

import { segmentTitles, titleIndex } from './title-links.js';
import { aiBadge, badge, el, linkTo, richText } from './ui.js';

const DEFAULT_SHOWN = 50;

const statusBadge = (ctx, status) =>
  badge(ctx.doc, ctx.t, 'status', status === 'confirmed' ? 'editorially_confirmed' : 'suggested');

/** Whether the pack carries a page whose subject it also holds; without one the plain list of people is shown. */
export const hasThinkersPage = (data) => data.thinkersPage !== null && data.thinkers.has(data.thinkersPage.subject?.id);

/**
 * On a person's page: the owner's other collections that hold them (D91 stage 6), from the same private page data. The counts come from
 * name matching, so the section is marked suggested. Null when there is nothing to say.
 */
export function elsewhereSection(ctx, id) {
  const { doc, t, data } = ctx;
  const found = data.thinkersPage?.elsewhere;
  const rows = found?.people?.[id] ?? [];
  if (rows.length === 0) return null;
  const count = (key, n, params = {}) => t(n === 1 ? `${key}_one` : key, { ...params, count: n });
  const lenses = new Map(found.lenses.map((l) => [l.id, l]));
  const line = (row) => {
    const lens = lenses.get(row.lens) ?? { title: row.lens, records: 0 };
    const parts = [
      row.subject ? count('else_subject', lens.records) : null,
      row.authored > 0 ? count('else_authored', row.authored) : null,
      row.engaged > 0 ? count('else_engaged', row.engaged) : null,
      // How many of those are by that collection's own subject.
      row.engagedOwn > 0 && !row.subject ? count('else_engaged_own', row.engagedOwn, { name: lens.title }) : null,
    ].filter(Boolean);
    // Where this computer can open that collection (the desktop app), a plain link the app's window follows itself.
    const path = data.pathOf(id);
    const open =
      path !== null && ctx.lenses?.includes(row.lens)
        ? el(
            doc,
            'a',
            { href: ctx.href(`/lens/${row.lens}${path}`), class: 'lens-link' },
            t('else_open', { name: lens.title }),
          )
        : null;
    return el(
      doc,
      'li',
      {},
      el(doc, 'strong', { text: t('else_collection', { name: lens.title }) }),
      ' ',
      parts.join('; '),
      open ? [' – ', open] : null,
    );
  };
  return el(
    doc,
    'section',
    { id: 'elsewhere', 'aria-labelledby': 'elsewhere-heading' },
    el(doc, 'h2', { id: 'elsewhere-heading', text: t('else_title') }),
    el(doc, 'p', { class: 'badges' }, badge(doc, t, 'status', 'suggested')),
    el(doc, 'p', { class: 'hint', text: t('else_note') }),
    el(doc, 'ul', {}, rows.map(line)),
  );
}

export function renderThinkersPage(ctx, main) {
  const { doc, t, data } = ctx;
  const page = data.thinkersPage;
  const known = (rows) => (rows ?? []).filter((r) => data.thinkers.has(r.id));
  const shown = page.settings?.shown ?? DEFAULT_SHOWN;

  const titles = titleIndex(
    [...data.sources.values()].map((s) => ({
      id: s.id,
      title: s.citation?.title ?? s.displayTitle,
      type: data.records.get(s.id)?.type,
    })),
  );
  // A note or reason, with the works it names linked.
  const noted = (note, forms) =>
    el(
      doc,
      'p',
      { class: 'person-note', lang: 'en' },
      segmentTitles(note, titles, forms).map((part) =>
        part.id !== null && data.sources.has(part.id)
          ? el(
              doc,
              'a',
              { href: ctx.href(data.pathOf(part.id)), 'data-link': true },
              el(doc, 'cite', { text: part.text }),
            )
          : richText(doc, part.text),
      ),
    );

  // One person: the link, then (as they apply) the record count, a mark, and the note or reason in the owner's own words.
  const item = (row, { derived }) => {
    const note = row.note ?? row.reason;
    return el(
      doc,
      'li',
      {},
      linkTo(doc, ctx, row.id),
      row.records
        ? [
            ' ',
            el(doc, 'span', {
              class: 'meta',
              text: row.records === 1 ? t('tp_records_one') : t('tp_records', { count: row.records }),
            }),
          ]
        : null,
      // A derived list is marked as a whole, so a row is marked only when the owner confirmed it.
      !derived || row.status === 'confirmed' ? [' ', statusBadge(ctx, row.status)] : null,
      row.provenance?.drafted_by?.includes('AI-assisted') ? [' ', aiBadge(doc, t)] : null,
      note ? noted(note, row.links) : null,
    );
  };

  // The first `shown` names, and the rest behind "Show all".
  const list = (rows, { derived = false, wide = false } = {}) => {
    const ul = (part) =>
      el(
        doc,
        'ul',
        { class: wide ? 'people-notes' : 'people' },
        part.map((r) => item(r, { derived })),
      );
    if (rows.length <= shown) return [ul(rows)];
    return [
      ul(rows.slice(0, shown)),
      el(
        doc,
        'details',
        { class: 'show-all' },
        el(doc, 'summary', { text: t('tp_show_all', { count: rows.length }) }),
        ul(rows.slice(shown)),
      ),
    ];
  };

  const section = (id, title, count, ...content) =>
    el(doc, 'section', { id: `tp-${id}` }, el(doc, 'h2', { text: `${title} (${count})` }), ...content.flat());
  const suggested = () => el(doc, 'p', { class: 'badges' }, statusBadge(ctx, 'suggested'));

  main.append(
    el(doc, 'p', { class: 'hint', text: t('tp_note') }),
    el(doc, 'section', { id: 'tp-subject' }, el(doc, 'h2', {}, linkTo(doc, ctx, page.subject.id))),
  );

  for (const [id, key] of [
    ['collaborators', 'tp_collaborators'],
    ['key_partners', 'tp_key_partners'],
  ]) {
    const rows = known(page[id]);
    if (rows.length > 0) main.append(section(id, t(key), rows.length, list(rows, { wide: true })));
  }

  const periods = ['historical', 'contemporary']
    .map((period) => [period, known(page.engages?.[period])])
    .filter(([, rows]) => rows.length > 0);
  if (periods.length > 0) {
    main.append(
      section(
        'engages',
        t('tp_engages'),
        periods.reduce((n, [, rows]) => n + rows.length, 0),
        suggested(),
        periods.flatMap(([period, rows]) => [
          el(doc, 'h3', { text: `${t(`tp_${period}`)} (${rows.length})` }),
          ...list(rows, { derived: true }),
        ]),
      ),
    );
  }

  const engagedBy = known(page.engaged_by);
  if (engagedBy.length > 0)
    main.append(
      section('engaged_by', t('tp_engaged_by'), engagedBy.length, suggested(), list(engagedBy, { derived: true })),
    );

  const adjacent = known(page.adjacent);
  if (adjacent.length > 0) {
    const french = ctx.uiLanguage === 'fr';
    const topics = page.adjacent_topics ?? [];
    const groups = topics.map((topic) => [
      (french && topic.title_fr) || topic.title,
      adjacent.filter((a) => a.topics?.includes(topic.id)),
    ]);
    const rest = adjacent.filter((a) => !topics.some((topic) => a.topics?.includes(topic.id)));
    if (topics.length > 0) groups.push([t('tp_no_topic'), rest]);
    main.append(
      section(
        'adjacent',
        t('tp_adjacent'),
        adjacent.length,
        topics.length === 0
          ? list(adjacent, { wide: true })
          : groups
              .filter(([, rows]) => rows.length > 0)
              .flatMap(([title, rows]) => [el(doc, 'h3', { text: title }), ...list(rows, { wide: true })]),
      ),
    );
  }

  const misc = known(page.miscellaneous);
  if (misc.length > 0)
    main.append(section('miscellaneous', t('tp_misc'), misc.length, suggested(), list(misc, { derived: true })));
  return main;
}
