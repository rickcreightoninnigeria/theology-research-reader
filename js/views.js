// The research views (stage 8): the timeline, a position page and the side-by-side comparison. They read from `ctx`
// ({ doc, t, data, href, ... }) and keep their state in the web address, so a view can be shared and the back button works.

import { compareItems, developmentAmong, positionsOn, MAX_ITEMS } from './compare.js';
import { actions, authoredBadges, claimItem, metaLine, provenanceNote } from './pages.js';
import { centuryLabel, filterEvents, groupByCentury, groupOf, GROUP_NAMES, yearText } from './timeline.js';
import { badge, el, linkTo, richText, titleRow } from './ui.js';

const DEVELOPMENT = new Set(['republished_as', 'develops', 'elaborates', 'revises', 'reverses']);

/** The development relationships as a list: "A revises B", each with its status badge. A `suggested` one says so in words. */
export function developmentList(ctx, relationships, { id = 'threads' } = {}) {
  const { doc, t } = ctx;
  return el(
    doc,
    'ul',
    { id, class: 'threads' },
    relationships.map((r) =>
      el(
        doc,
        'li',
        { 'data-status': r.status },
        linkTo(doc, ctx, r.from),
        ` ${t(`rel_${r.type}`).toLowerCase()} `,
        linkTo(doc, ctx, r.to),
        ' ',
        badge(doc, t, 'status', r.status),
      ),
    ),
  );
}

export function readTimelineState(search) {
  const params = new URLSearchParams(search);
  const num = (name) => (params.get(name) && /^-?\d+$/.test(params.get(name)) ? Number(params.get(name)) : null);
  return { groups: params.getAll('kind').filter((g) => GROUP_NAMES.includes(g)), from: num('from'), to: num('to') };
}

export function timelineQuery({ groups, from, to }) {
  const params = new URLSearchParams();
  for (const g of groups) params.append('kind', g);
  if (from !== null) params.set('from', String(from));
  if (to !== null) params.set('to', String(to));
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** The timeline: filter form, development threads, then publications, positions and context by century. */
export function renderTimeline(ctx, { search, go }) {
  const { doc, t, data } = ctx;
  const state = readTimelineState(search);
  const main = el(doc, 'section', { id: 'timeline' });
  main.append(el(doc, 'h1', { id: 'page-heading', text: t('tile_timeline') }));

  const form = el(doc, 'form', { id: 'timeline-filter' });
  const fieldset = el(doc, 'fieldset', {}, el(doc, 'legend', { text: t('tl_show') }));
  for (const group of GROUP_NAMES) {
    const box = el(doc, 'input', { type: 'checkbox', id: `tl-${group}`, name: 'kind', value: group });
    box.checked = state.groups.length === 0 || state.groups.includes(group);
    fieldset.append(
      el(
        doc,
        'div',
        {},
        box,
        ' ',
        el(doc, 'label', { for: `tl-${group}`, class: 'inline', text: t(`tl_group_${group}`) }),
      ),
    );
  }
  const from = el(doc, 'input', {
    type: 'number',
    id: 'tl-from',
    name: 'from',
    inputmode: 'numeric',
    value: state.from ?? '',
  });
  const to = el(doc, 'input', { type: 'number', id: 'tl-to', name: 'to', inputmode: 'numeric', value: state.to ?? '' });
  form.append(
    fieldset,
    el(doc, 'div', {}, el(doc, 'label', { for: 'tl-from', text: t('tl_from') }), from),
    el(doc, 'div', {}, el(doc, 'label', { for: 'tl-to', text: t('tl_to') }), to),
    el(doc, 'button', { type: 'submit', text: t('tl_apply') }),
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const checked = GROUP_NAMES.filter((g) => form.querySelector(`#tl-${g}`).checked);
    const num = (input) =>
      input.value.trim() !== '' && /^-?\d+$/.test(input.value.trim()) ? Number(input.value.trim()) : null;
    go(timelineQuery({ groups: checked.length === GROUP_NAMES.length ? [] : checked, from: num(from), to: num(to) }));
  });
  main.append(form);

  const threads = data.relationships.filter((r) => DEVELOPMENT.has(r.type));
  main.append(el(doc, 'h2', { text: t('timeline_threads') }));
  main.append(
    threads.length === 0 ? el(doc, 'p', { class: 'hint', text: t('pub_nothing_yet') }) : developmentList(ctx, threads),
  );
  if (positionsOnAny(data))
    main.append(
      el(
        doc,
        'p',
        {},
        el(doc, 'a', { href: ctx.href('/compare'), 'data-link': true, id: 'to-compare', text: t('tl_compare_link') }),
      ),
    );

  const shown = filterEvents(data.timeline.events, state);
  main.append(
    el(doc, 'h2', { text: t('timeline_events') }),
    el(doc, 'p', { id: 'timeline-count', role: 'status', text: t('tl_count', { count: shown.length }) }),
  );
  const groups = groupByCentury(shown);
  if (groups.length === 0) main.append(el(doc, 'p', { class: 'hint', text: t('tl_none') }));
  for (const { century, events } of groups) {
    const block = el(
      doc,
      'details',
      { class: 'century', open: century >= 18 || events.some((e) => groupOf(e.kind) !== 'publication') },
      el(doc, 'summary', { text: `${centuryLabel(century)} (${events.length})` }),
    );
    const list = el(doc, 'ol', { class: 'events' });
    for (const e of events) list.append(eventItem(ctx, e));
    block.append(list);
    main.append(block);
  }
  return main;
}

const positionsOnAny = (data) => data.positions.size >= 2;

function eventItem(ctx, e) {
  const { doc, t, data } = ctx;
  const li = el(doc, 'li', { 'data-id': e.id, 'data-kind': e.kind });
  const path = data.pathOf(e.id) ?? null;
  li.append(
    el(doc, 'span', { class: 'year', text: `${yearText(e)}: ` }),
    path ? linkTo(doc, ctx, e.id, e.label) : richText(doc, e.label),
    ' ',
    badge(doc, t, 'kind', e.kind),
    ' ',
    badge(
      doc,
      t,
      'status',
      e.kind === 'publication' && e.status === 'confirmed' ? 'confirmed' : (e.status ?? 'suggested'),
    ),
  );
  if (e.kind === 'position' && e.holder)
    li.append(' ', el(doc, 'span', { class: 'meta', text: data.titleOf(e.holder) }));
  if (groupOf(e.kind) === 'context' && (e.description || e.links?.length)) {
    const more = el(
      doc,
      'details',
      { class: 'event-more' },
      el(doc, 'summary', { text: t('tl_more') }),
      el(doc, 'p', { text: e.description ?? '' }),
    );
    const links = (e.links ?? []).filter((id) => data.pathOf(id));
    if (links.length > 0)
      more.append(
        el(
          doc,
          'ul',
          {},
          links.map((id) => el(doc, 'li', {}, linkTo(doc, ctx, id))),
        ),
      );
    li.append(more);
  }
  return li;
}

/** A position (D4): holder, level, period, summary, evidence and the other positions on the same question. */
export function renderPosition(ctx, id) {
  const { doc, t, data } = ctx;
  const p = data.positions.get(id);
  if (p === undefined) return el(doc, 'section', {}, el(doc, 'h1', { id: 'page-heading', text: t('not_found') }));
  const main = el(doc, 'article');
  main.append(titleRow(doc, el(doc, 'h1', { id: 'page-heading', text: p.title }), authoredBadges(ctx, p)));
  if (p.status === 'suggested')
    main.append(
      el(doc, 'p', { class: 'warning', role: 'note', id: 'suggested-note', text: t('suggested_position_note') }),
    );
  const dl = el(doc, 'dl', { id: 'position-facts' });
  const row = (label, ...value) => dl.append(el(doc, 'dt', { text: label }), el(doc, 'dd', {}, ...value));
  row(t('pos_holder'), linkTo(doc, ctx, p.holder.id), ` (${t(`holder_kind_${p.holder.kind}`)})`);
  row(t('pos_level'), t(`level_${p.level}`));
  row(t('pos_period'), periodText(t, p.period));
  row(t('pos_concept'), linkTo(doc, ctx, p.concept));
  main.append(
    dl,
    el(doc, 'h2', { text: t('pos_summary') }),
    el(doc, 'p', { id: 'position-summary', text: p.summary.replace(/\s+/g, ' ').trim() }),
  );
  if (p.evidence?.length)
    main.append(
      el(doc, 'h2', { text: t('concept_evidence') }),
      el(
        doc,
        'ul',
        {},
        p.evidence.map((e) => claimItem(ctx, e)),
      ),
    );
  const others = positionsOn(data, p.concept).filter((x) => x.id !== id);
  if (others.length > 0) {
    main.append(
      el(doc, 'h2', { text: t('pos_others') }),
      el(
        doc,
        'ul',
        {},
        others.map((o) => el(doc, 'li', {}, linkTo(doc, ctx, o.id), ' ', badge(doc, t, 'status', o.status))),
      ),
    );
    main.append(
      el(
        doc,
        'p',
        {},
        el(doc, 'a', {
          href: ctx.href(`/compare?items=${[id, ...others.map((o) => o.id)].map(encodeURIComponent).join(',')}`),
          'data-link': true,
          id: 'compare-these',
          text: t('pos_compare_all'),
        }),
      ),
    );
  }
  main.append(
    metaLine(ctx, [id]),
    actions(ctx, {
      key: id,
      title: p.title,
      cite: {
        work: `${t('app_title')}. “${p.title}.” ${t('cite_position_note')}`,
        platformTitle: p.title,
        verification: undefined,
      },
    }),
  );
  main.append(provenanceNote(ctx, p));
  return main;
}

function periodText(t, period) {
  if (!period?.from) return '—';
  const text = period.to && period.to !== period.from ? `${period.from}–${period.to}` : String(period.from);
  return `${period.approximate ? `${t('pos_approx')} ` : ''}${text}`;
}

const REFUSAL = {
  too_few: 'compare_refuse_too_few',
  unknown_item: 'compare_refuse_unknown',
  unlike_kinds: 'compare_refuse_kinds',
  unlike_concepts: 'compare_refuse_concepts',
  unsupported_kind: 'compare_refuse_unsupported',
};

/** The comparison page: pick a question (concept), tick positions, see them side by side; unlike things are refused in words. */
export function renderCompare(ctx, { search, go }) {
  const { doc, t, data } = ctx;
  const params = new URLSearchParams(search);
  const main = el(doc, 'section', { id: 'compare' });
  main.append(
    el(doc, 'h1', { id: 'page-heading', text: t('compare_title') }),
    el(doc, 'p', { class: 'hint', text: t('compare_intro') }),
  );

  const withPositions = [...data.concepts.values()].filter((c) => positionsOn(data, c.id).length >= 2);
  const itemsParam = params.get('items');
  const items = itemsParam ? itemsParam.split(',').filter(Boolean) : [];
  const concept =
    params.get('concept') ??
    (items.length > 0 ? (data.positions.get(items[0])?.concept ?? null) : null) ??
    withPositions[0]?.id ??
    null;

  if (withPositions.length === 0 && items.length === 0) {
    main.append(el(doc, 'p', { class: 'hint', text: t('compare_none') }));
    return main;
  }

  const form = el(doc, 'form', { id: 'compare-form' });
  const picker = el(doc, 'select', { id: 'compare-concept', 'aria-label': t('compare_question') });
  for (const c of withPositions) {
    const option = el(doc, 'option', { value: c.id, text: c.name });
    if (c.id === concept) option.selected = true;
    picker.append(option);
  }
  picker.addEventListener('change', () => go(`?concept=${encodeURIComponent(picker.value)}`));
  form.append(el(doc, 'label', { for: 'compare-concept', text: t('compare_question') }), picker);
  const candidates = concept ? positionsOn(data, concept) : [];
  const chosen = new Set(items.length > 0 ? items : candidates.slice(0, MAX_ITEMS).map((p) => p.id));
  const fieldset = el(doc, 'fieldset', {}, el(doc, 'legend', { text: t('compare_pick') }));
  for (const p of candidates) {
    const box = el(doc, 'input', { type: 'checkbox', id: `cmp-${p.id}`, value: p.id, 'data-compare': true });
    box.checked = chosen.has(p.id);
    fieldset.append(
      el(doc, 'div', {}, box, ' ', el(doc, 'label', { for: `cmp-${p.id}`, class: 'inline', text: p.title })),
    );
  }
  form.append(fieldset, el(doc, 'button', { type: 'submit', text: t('compare_button') }));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const ids = [...form.querySelectorAll('input[data-compare]:checked')].map((b) => b.value);
    go(`?items=${ids.map(encodeURIComponent).join(',')}`);
  });
  main.append(form);

  const ids = items.length > 0 ? items : [...chosen];
  const result = compareItems(ids, data);
  if (!result.ok) {
    const detail =
      result.reason === 'unlike_kinds'
        ? result.detail.kinds.map((k) => t(`compare_kind_${k}`)).join(', ')
        : (result.detail.ids ?? []).join(', ');
    main.append(
      el(doc, 'p', {
        id: 'compare-refusal',
        class: 'warning',
        role: 'alert',
        text: t(REFUSAL[result.reason], { detail }),
      }),
    );
    return main;
  }
  const grid = el(doc, 'div', { id: 'compare-grid', class: 'compare-grid' });
  for (const item of result.columns) grid.append(compareCard(ctx, result.kind, item));
  main.append(grid);
  if (result.truncated) main.append(el(doc, 'p', { class: 'hint', text: t('compare_truncated', { max: MAX_ITEMS }) }));
  const dev = developmentAmong(ids, data);
  main.append(
    el(doc, 'h2', { text: t('compare_development') }),
    dev.length === 0
      ? el(doc, 'p', { class: 'hint', id: 'compare-dev-none', text: t('compare_no_development') })
      : developmentList(ctx, dev, { id: 'compare-dev' }),
  );
  return main;
}

function compareCard(ctx, kind, item) {
  const { doc, t, data } = ctx;
  const card = el(
    doc,
    'section',
    { class: 'compare-card', 'data-id': item.id },
    el(doc, 'h3', {}, linkTo(doc, ctx, item.id)),
  );
  const dl = el(doc, 'dl');
  const row = (label, ...value) => dl.append(el(doc, 'dt', { text: label }), el(doc, 'dd', {}, ...value));
  if (kind === 'position') {
    row(t('pos_holder'), linkTo(doc, ctx, item.holder.id), ` (${t(`holder_kind_${item.holder.kind}`)})`);
    row(t('pos_level'), t(`level_${item.level}`));
    row(t('pos_period'), periodText(t, item.period));
    row(t('pos_summary'), item.summary.replace(/\s+/g, ' ').trim());
    row(t('concept_evidence'), String(item.evidence?.length ?? 0));
  } else {
    row(t('arg_central'), data.claims.get(item.central_proposition)?.text ?? item.central_proposition);
    row(t('arg_reasoning'), item.reasoning.replace(/\s+/g, ' ').trim());
    row(t('arg_premises'), String(item.premises?.length ?? 0));
  }
  row(t('compare_status'), badge(doc, t, 'status', item.status));
  card.append(dl);
  return card;
}
