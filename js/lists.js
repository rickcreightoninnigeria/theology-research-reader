// The home page, the six entry-point list pages, the pathway pages and the "New here?" page (stage 6). Each returns a DOM element.
// They read from `ctx` ({ doc, t, data, href, ... }); the lists all lead to the same records the search finds.

import { yearOf } from './cite.js';
import { importBlock } from './import-ui.js';
import { hasThinkersPage, renderThinkersPage } from './thinkers-view.js';
import { aiBadge, badge, coverOrPlaceholder, el, linkTo } from './ui.js';

const ROLE_ORDER = ['odonovan_own', 'scholarship', 'sourcebook'];
const KIND_ORDER = ['o_donovan', 'subject', 'anchor', 'engaged', 'historical', 'body', 'scholar'];

export const ENTRY_TILES = [
  { name: 'publications', path: '/publications', title: 'tile_publications', text: 'tile_publications_text' },
  { name: 'themes', path: '/themes', title: 'tile_themes', text: 'tile_themes_text' },
  { name: 'arguments', path: '/arguments', title: 'tile_arguments', text: 'tile_arguments_text' },
  { name: 'thinkers', path: '/thinkers', title: 'tile_thinkers', text: 'tile_thinkers_text' },
  { name: 'timeline', path: '/timeline', title: 'tile_timeline', text: 'tile_timeline_text' },
  { name: 'pathways', path: '/pathways', title: 'tile_pathways', text: 'tile_pathways_text' },
];

const heading = (doc, text) => el(doc, 'h1', { id: 'page-heading', text });
const sorted = (list, key) => [...list].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));

/** The home page (D31): search, six tiles, continue, collection version and offline status, a small "New here?" link. */
export function renderHome(ctx, { last = null, online = true, pending = null } = {}) {
  const { doc, t, data } = ctx;
  const main = el(doc, 'section', { id: 'home' });
  main.append(heading(doc, t('app_title')));
  if (data === undefined) {
    main.append(el(doc, 'p', { text: t('home_no_collection') }));
    if (ctx.idb) main.append(importBlock(ctx, { current: null }));
    return main;
  }
  if (data.sources.size === 0) {
    main.append(
      el(doc, 'h2', { text: t('home_empty_title') }),
      el(doc, 'p', { id: 'home-empty', text: t('home_empty') }),
      importBlock(ctx, { current: ctx.collectionMeta }),
    );
  }
  const input = el(doc, 'input', {
    type: 'search',
    id: 'home-search',
    name: 'q',
    autocomplete: 'off',
    enterkeyhint: 'search',
  });
  const form = el(
    doc,
    'form',
    { role: 'search', id: 'home-search-form', action: ctx.href('/search'), method: 'get' },
    el(doc, 'label', { for: 'home-search', text: t('search_label') }),
    input,
    el(doc, 'button', { type: 'submit', text: t('search_button') }),
  );
  main.append(form);

  const tiles = el(doc, 'ul', { id: 'entry-tiles', class: 'tiles' });
  const has = {
    publications: true,
    themes: data.concepts.size > 0 || Object.keys(data.hubs).length > 0,
    arguments: data.arguments.size > 0,
    thinkers: data.thinkers.size > 0,
    timeline: (data.timeline.events?.length ?? 0) > 0,
    pathways: data.pathways.size > 0,
  };
  for (const tile of ENTRY_TILES.filter((x) => has[x.name] !== false)) {
    tiles.append(
      el(
        doc,
        'li',
        {},
        el(
          doc,
          'a',
          { href: ctx.href(tile.path), 'data-link': true, class: 'tile' },
          el(doc, 'strong', { text: t(tile.title) }),
          el(doc, 'span', {
            text: t(tile.name === 'thinkers' && !data.site.subject ? 'tile_thinkers_text_generic' : tile.text),
          }),
        ),
      ),
    );
  }
  main.append(tiles);

  if (last !== null) {
    main.append(
      el(
        doc,
        'p',
        { id: 'continue' },
        `${t('home_continue')} `,
        el(doc, 'a', { href: ctx.href(last.path), 'data-link': true, text: last.title }),
      ),
    );
  }
  const site = data.site;
  main.append(
    el(
      doc,
      'p',
      { id: 'collection-summary', class: 'meta' },
      t('home_summary', {
        version: site.collectionVersion ?? '—',
        sources: ctx.masterIndex?.sourceCount ?? data.sources.size,
        records: ctx.masterIndex?.recordCount ?? data.records.size,
      }),
      ' · ',
      el(doc, 'span', { id: 'offline-status', text: online ? t('home_online') : t('home_offline') }),
      pending ? ` · ${t('home_update_waiting')}` : '',
    ),
  );
  main.append(
    el(
      doc,
      'p',
      {},
      el(doc, 'a', { href: ctx.href('/start'), 'data-link': true, id: 'new-here', text: t('home_new_here') }),
    ),
  );
  return main;
}

export function renderStart(ctx) {
  const { doc, t, data } = ctx;
  const main = el(doc, 'article', { id: 'start' });
  main.append(
    heading(doc, t('start_title')),
    el(doc, 'p', { text: t(data.site.subject ? 'start_intro' : 'start_intro_generic') }),
  );
  main.append(
    el(doc, 'h2', { text: t('start_pathways') }),
    el(
      doc,
      'ul',
      {},
      [...data.pathways.values()].map((p) => el(doc, 'li', {}, linkTo(doc, ctx, p.id, p.title))),
    ),
  );
  main.append(el(doc, 'p', {}, el(doc, 'a', { href: ctx.href('/about'), 'data-link': true, text: t('start_about') })));
  return main;
}

/** Publications: every source, grouped by source role, then by year. */
export function renderPublications(ctx) {
  const { doc, t, data } = ctx;
  const main = el(doc, 'section', { id: 'publications' });
  main.append(heading(doc, t('tile_publications')));
  const bySource = [...data.sources.values()].map((s) => ({ source: s, record: data.records.get(s.id) }));
  // Without a subject there are no roles: one list of every source.
  for (const role of data.site.subject ? ROLE_ORDER : ['all']) {
    const group = sorted(
      bySource.filter((x) => role === 'all' || (x.record?.role ?? 'scholarship') === role),
      (x) => `${yearOf(x.source.citation?.dates?.original) ?? 9999}${x.source.id}`,
    );
    if (group.length === 0) continue;
    main.append(
      el(doc, 'h2', { text: `${role === 'all' ? t('pub_all_sources') : t(`badge_role_${role}`)} (${group.length})` }),
    );
    const list = el(doc, 'ul', { class: 'publist' });
    for (const { source, record } of group) {
      const creators = (source.citation?.creators ?? []).map((c) => c.display_name ?? c.name).join(', ');
      const published = yearOf(source.citation?.dates?.original) ?? t('pub_no_date');
      list.append(
        el(
          doc,
          'li',
          {},
          coverOrPlaceholder(ctx, source.id, 'cover-thumb'),
          el(
            doc,
            'span',
            { class: 'row-text' },
            linkTo(doc, ctx, source.id),
            ' ',
            el(doc, 'span', {
              class: 'meta',
              text: `${creators} (${published})`.trim(),
            }),
          ),
          ' ',
          badge(doc, t, 'state', source.state),
          record ? [' ', badge(doc, t, 'verification', record.verification?.quotations ?? 'unstated')] : null,
        ),
      );
    }
    main.append(list);
  }
  return main;
}

/** Themes and concepts: the three hubs first, then the concepts by group. */
export function renderThemes(ctx) {
  const { doc, t, data } = ctx;
  const main = el(doc, 'section', { id: 'themes' });
  main.append(heading(doc, t('tile_themes')));
  const groups = { A: t('themes_group_a'), B: t('themes_group_b'), C: t('themes_group_c') };
  const concepts = [...data.concepts.values()];
  for (const [code, label] of Object.entries(groups)) {
    const list = sorted(
      concepts.filter((c) => c.group === code),
      (c) => c.name,
    );
    if (list.length === 0) continue;
    main.append(el(doc, 'h2', { text: label }));
    main.append(
      el(
        doc,
        'ul',
        {},
        list.map((c) =>
          el(
            doc,
            'li',
            {},
            linkTo(doc, ctx, c.id),
            ' ',
            badge(doc, t, 'status', c.status),
            c.provenance?.drafted_by?.includes('AI-assisted') ? [' ', aiBadge(doc, t)] : null,
          ),
        ),
      ),
    );
  }
  return main;
}

export function renderArgumentsList(ctx) {
  const { doc, t, data } = ctx;
  const main = el(doc, 'section', { id: 'arguments' });
  main.append(heading(doc, t('tile_arguments')));
  const list = el(doc, 'ul', {});
  for (const a of sorted([...data.arguments.values()], (x) => x.title)) {
    list.append(
      el(
        doc,
        'li',
        {},
        linkTo(doc, ctx, a.id),
        ' ',
        badge(doc, t, 'status', a.status),
        a.provenance?.drafted_by?.includes('AI-assisted') ? [' ', aiBadge(doc, t)] : null,
      ),
    );
  }
  main.append(list.children.length ? list : el(doc, 'p', { class: 'hint', text: t('pub_nothing_yet') }));
  return main;
}

/**
 * Thinkers: by relationship to the subject where the pack carries that page (private packs); otherwise by kind (O’Donovan, anchors,
 * other thinkers, then scholars). Each person links to their own page.
 */
export function renderThinkers(ctx) {
  const { doc, t, data } = ctx;
  const main = el(doc, 'section', { id: 'thinkers' });
  main.append(heading(doc, t('tile_thinkers')));
  if (hasThinkersPage(data)) return renderThinkersPage(ctx, main);
  const people = [...data.thinkers.values()];
  for (const kind of KIND_ORDER) {
    const list = sorted(
      people.filter((p) => p.kind === kind),
      (p) => (p.display_name ?? p.name).toLowerCase(),
    );
    if (list.length === 0) continue;
    main.append(el(doc, 'h2', { text: `${t(`kind_${kind}`)} (${list.length})` }));
    main.append(
      el(
        doc,
        'ul',
        { class: 'people' },
        list.map((p) => el(doc, 'li', {}, linkTo(doc, ctx, p.id))),
      ),
    );
  }
  return main;
}

export function renderPathways(ctx) {
  const { doc, t, data } = ctx;
  const main = el(doc, 'section', { id: 'pathways' });
  main.append(heading(doc, t('tile_pathways')));
  const list = el(doc, 'ul', { class: 'pathways' });
  for (const p of data.pathways.values()) {
    list.append(
      el(
        doc,
        'li',
        {},
        el(doc, 'h2', {}, linkTo(doc, ctx, p.id, p.title)),
        el(doc, 'p', { text: p.description ?? '' }),
        el(
          doc,
          'p',
          { class: 'badges' },
          badge(doc, t, 'status', p.status),
          p.provenance?.drafted_by?.includes('AI-assisted') ? [' ', aiBadge(doc, t)] : null,
          ` ${t('pathway_steps', { count: p.steps.length })}`,
        ),
      ),
    );
  }
  main.append(list.children.length ? list : el(doc, 'p', { class: 'hint', text: t('pub_nothing_yet') }));
  return main;
}

/** One pathway: its steps in order, each with a link to the record and a reflection question. */
export function renderPathway(ctx, id) {
  const { doc, t, data } = ctx;
  const p = data.pathways.get(id);
  if (p === undefined) return el(doc, 'section', {}, heading(doc, t('not_found')));
  const main = el(doc, 'article', { id: 'pathway' });
  main.append(
    el(
      doc,
      'p',
      { class: 'crumb' },
      el(doc, 'a', { href: ctx.href('/pathways'), 'data-link': true, text: `← ${t('tile_pathways')}` }),
    ),
  );
  main.append(heading(doc, p.title), el(doc, 'p', { text: p.description ?? '' }));
  main.append(
    el(
      doc,
      'p',
      { class: 'badges' },
      badge(doc, t, 'status', p.status),
      p.provenance?.drafted_by?.includes('AI-assisted') ? [' ', aiBadge(doc, t)] : null,
    ),
  );
  const steps = el(doc, 'ol', { id: 'steps' });
  p.steps.forEach((step, i) => {
    const found = data.resolve(step.record);
    const authored = found && ['argument', 'concept'].includes(found.kind) ? found.item : null;
    steps.append(
      el(
        doc,
        'li',
        { id: `step-${i + 1}` },
        el(doc, 'strong', {}, linkTo(doc, ctx, step.record)),
        ' ',
        authored
          ? badge(doc, t, 'status', authored.status)
          : found?.item?.verification
            ? badge(doc, t, 'verification', found.item.verification.quotations)
            : null,
        step.question
          ? el(doc, 'p', { class: 'question' }, el(doc, 'em', { text: `${t('pathway_reflect')} ` }), step.question)
          : null,
      ),
    );
  });
  main.append(steps);
  main.append(
    el(
      doc,
      'p',
      {},
      el(doc, 'a', {
        href: ctx.href(`/pathway/${encodeURIComponent(id)}/review`),
        'data-link': true,
        id: 'review-link',
        text: t('review_link'),
      }),
    ),
  );
  return main;
}

/** The evidence table of a hub, shown on its concept page (D13): coverage line, rows by source role, other mentions, no editorial reading yet. */
export function renderHubTable(ctx, hub) {
  const { doc, t, data } = ctx;
  const box = el(doc, 'section', { id: 'hub-table', class: 'hub' });
  box.append(el(doc, 'h2', { text: t('hub_evidence') }), el(doc, 'p', { id: 'hub-coverage', text: hub.coverage.line }));
  const row = (r) =>
    el(
      doc,
      'li',
      {},
      linkTo(doc, ctx, r.key, data.records.get(r.key)?.title ?? r.key),
      r.year ? ` (${r.year})` : '',
      ' ',
      badge(doc, t, 'status', r.status),
      ` `,
      el(doc, 'span', { class: 'meta', text: r.via.join('; ') }),
    );
  const groupBlock = (groups) =>
    groups.map((g) =>
      el(
        doc,
        'div',
        {},
        el(doc, 'h3', { text: `${t(`badge_role_${g.role}`)} (${g.rows.length})` }),
        el(doc, 'ul', {}, g.rows.map(row)),
      ),
    );
  box.append(...groupBlock(hub.groups));
  for (const [name, groups] of Object.entries(hub.subSections ?? {})) {
    if (groups.length === 0) continue;
    box.append(el(doc, 'h3', { text: name }), ...groupBlock(groups));
  }
  if (hub.otherMentions?.length) {
    box.append(
      el(
        doc,
        'details',
        { id: 'hub-mentions' },
        el(doc, 'summary', { text: `${t('hub_mentions')} (${hub.otherMentions.length})` }),
        el(doc, 'ul', {}, hub.otherMentions.map(row)),
      ),
    );
  }
  const links = (hub.crossLinks ?? []).filter((c) => c.hub && data.hubs[c.hub]);
  if (links.length > 0) {
    box.append(
      el(doc, 'h3', { text: t('hub_cross_links') }),
      el(
        doc,
        'ul',
        { id: 'hub-links' },
        links.map((c) =>
          el(
            doc,
            'li',
            {},
            linkTo(doc, ctx, data.hubs[c.hub].concept, data.hubs[c.hub].title),
            ` (${c.tags.join('; ')})`,
          ),
        ),
      ),
    );
  }
  box.append(el(doc, 'p', { id: 'hub-reading', class: 'hint', text: t('hub_no_reading') }));
  return box;
}
