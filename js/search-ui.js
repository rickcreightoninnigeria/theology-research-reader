// The search page: a query box, facet checkboxes, the verification filter (off by default), and results with a status badge on
// every result. The state lives in the URL (?q=…&type=…&verified=1), so a search can be shared and the back button works.

import { FACETS } from './search.js';
import { badge, el, linkTo, richText } from './ui.js';

const FACET_LABELS = {
  type: 'facet_type',
  author: 'facet_author',
  tag: 'facet_tag',
  concept: 'facet_concept',
  period: 'facet_period',
  role: 'facet_role',
  verification: 'facet_verification',
};

/** Reads the search state from a query string. */
export function readSearchState(search) {
  const params = new URLSearchParams(search);
  const filters = { hideUnchecked: params.get('verified') === '1' };
  for (const facet of FACETS) filters[facet] = params.getAll(facet);
  return { query: params.get('q') ?? '', filters };
}

/** The query string for a search state (the inverse of readSearchState). */
export function searchQuery({ query, filters }) {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  for (const facet of FACETS) for (const value of filters[facet] ?? []) params.append(facet, value);
  if (filters.hideUnchecked) params.set('verified', '1');
  const text = params.toString();
  return text ? `?${text}` : '';
}

function facetLabel(ctx, facet, value) {
  const { t, data } = ctx;
  switch (facet) {
    case 'author':
      return data.thinkers.get(value)?.display_name ?? data.thinkers.get(value)?.name ?? value;
    case 'concept':
      return data.concepts.get(value)?.name ?? value;
    case 'role':
      return t(`badge_role_${value}`) === `badge_role_${value}` ? t(`kind_${value}`) : t(`badge_role_${value}`);
    case 'verification':
      return t(`badge_verification_${value}`);
    default:
      return value;
  }
}

function resultBadge(ctx, doc) {
  const { doc: d, t, data } = ctx;
  if (doc.kind === 'record') {
    const record = data.records.get(doc.id);
    return [
      badge(d, t, 'state', doc.facets.state),
      ' ',
      badge(d, t, 'verification', doc.facets.verification ?? 'unstated'),
      record?.verification ? [' ', badge(d, t, 'pages', record.verification.pages)] : null,
    ];
  }
  if (doc.kind === 'source') return badge(d, t, 'state', doc.facets.state);
  if (doc.kind === 'thinker')
    return badge(d, t, 'person', data.thinkers.get(doc.id)?.status === 'confirmed' ? 'confirmed' : 'suggested');
  return badge(d, t, 'status', doc.facets.status ?? 'suggested');
}

const snippet = (data, id) => {
  const record = data.records.get(id);
  const text =
    record?.fields?.find((f) => f.name === 'Summary')?.value ??
    record?.fields?.find((f) => /purpose/i.test(f.name))?.value ??
    '';
  return text.replace(/\s+/g, ' ').slice(0, 220);
};

/**
 * Draws the page. `run(query, filters)` returns the engine's result; `go(queryString)` navigates (it re-renders the page).
 */
export function renderSearch(ctx, { search, run, go }) {
  const { doc, t, data } = ctx;
  const state = readSearchState(search);
  const main = el(doc, 'section', { id: 'search' });
  main.append(el(doc, 'h1', { id: 'page-heading', text: t('search_title') }));

  const input = el(doc, 'input', {
    type: 'search',
    id: 'q',
    name: 'q',
    value: state.query,
    autocomplete: 'off',
    enterkeyhint: 'search',
  });
  const form = el(
    doc,
    'form',
    { role: 'search', id: 'search-form' },
    el(doc, 'label', { for: 'q', text: t('search_label') }),
    input,
    el(doc, 'button', { type: 'submit', text: t('search_button') }),
  );
  const verified = el(doc, 'input', { type: 'checkbox', id: 'verified', name: 'verified' });
  verified.checked = state.filters.hideUnchecked;
  form.append(
    el(
      doc,
      'p',
      {},
      verified,
      ' ',
      el(doc, 'label', { for: 'verified', class: 'inline', text: t('search_hide_unchecked') }),
    ),
  );
  main.append(form);

  const result = run(state.query, state.filters);
  const readForm = () => {
    const filters = { hideUnchecked: verified.checked };
    for (const facet of FACETS)
      filters[facet] = [...form.querySelectorAll(`input[data-facet="${facet}"]:checked`)].map((c) => c.value);
    return { query: input.value.trim(), filters };
  };
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    go(searchQuery(readForm()));
  });
  verified.addEventListener('change', () => go(searchQuery(readForm())));

  const status = el(doc, 'p', { id: 'search-status', role: 'status' });
  main.append(status);
  if (state.query === '' && !FACETS.some((f) => state.filters[f]?.length) && !state.filters.hideUnchecked) {
    status.textContent = t('search_prompt');
    return main;
  }
  status.textContent = t('search_count', { count: result.total });
  if (result.expandedTags.length > 0)
    main.append(
      el(doc, 'p', {
        id: 'search-variant',
        class: 'hint',
        text: t('search_variant', { tags: result.expandedTags.join('; ') }),
      }),
    );

  const panel = el(doc, 'div', { id: 'facets' });
  for (const facet of FACETS) {
    const counts = result.facets[facet];
    const values = Object.keys(counts)
      .sort((a, b) => counts[b] - counts[a] || (a < b ? -1 : 1))
      .slice(0, 25);
    for (const chosen of state.filters[facet] ?? []) if (!values.includes(chosen)) values.push(chosen);
    if (values.length === 0) continue;
    const box = el(
      doc,
      'details',
      { class: 'facet', 'data-facet-group': facet },
      el(doc, 'summary', { text: t(FACET_LABELS[facet]) }),
    );
    for (const value of values) {
      const id = `f-${facet}-${value}`.replace(/[^\w-]/g, '_');
      const checkbox = el(doc, 'input', { type: 'checkbox', id, 'data-facet': facet, value });
      checkbox.checked = (state.filters[facet] ?? []).includes(value);
      checkbox.addEventListener('change', () => go(searchQuery(readForm())));
      box.append(
        el(
          doc,
          'div',
          {},
          checkbox,
          ' ',
          el(doc, 'label', {
            for: id,
            class: 'inline',
            text: `${facetLabel(ctx, facet, value)} (${counts[value] ?? 0})`,
          }),
        ),
      );
    }
    panel.append(box);
  }
  main.append(panel);

  const list = el(doc, 'ol', { id: 'results', class: 'results' });
  for (const r of result.results) {
    const { doc: hit } = r;
    const text = hit.kind === 'record' ? snippet(data, hit.id) : '';
    list.append(
      el(
        doc,
        'li',
        { 'data-id': hit.id },
        el(doc, 'strong', {}, linkTo(doc, ctx, hit.id, hit.title)),
        ' ',
        el(doc, 'span', { class: 'meta', text: t(`search_kind_${hit.kind}`) }),
        ' ',
        el(doc, 'span', { class: 'badges-inline' }, resultBadge(ctx, hit)),
        text ? el(doc, 'p', { class: 'snippet' }, richText(doc, text)) : null,
      ),
    );
  }
  main.append(list);
  if (result.total > result.results.length)
    main.append(
      el(doc, 'p', { class: 'hint', text: t('search_more', { shown: result.results.length, total: result.total }) }),
    );
  return main;
}
