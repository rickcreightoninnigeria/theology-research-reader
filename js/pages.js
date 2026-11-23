// The reading pages (stage 5): publication landing page, chapter page, argument, concept, thinker, scholar, and About.
// Each function returns a DOM element. They read from `ctx` ({ doc, t, data, href, appVersion, now }).

import { chicagoPlatform, chicagoWork, needsLocatorWarning } from './cite.js';
import { renderText } from './format-text.js';
import { renderHubTable } from './lists.js';
import { askAiBlock } from './ask-ai-ui.js';
import { linksFor, openCopy, openFormat } from './my-library.js';
import { workspaceBlock } from './workspace-ui.js';
import { buildReportMessage, reportMailto } from './report.js';
import { aiBadge, badge, el, linkTo, relatedSection, richText } from './ui.js';

const GLANCE_FIELDS = ['Author’s purpose and overall argument', 'Purpose and overall argument', 'Summary'];

const textBlock = (doc, text, attrs = {}) => {
  const box = el(doc, 'div', attrs);
  box.innerHTML = renderText(text);
  return box;
};

export function metaLine(ctx, ids) {
  const { doc, t, data } = ctx;
  const site = data.site;
  const parts = el(doc, 'p', {
    class: 'meta',
    text: t('meta_revised', { date: site.released ?? '—', version: site.collectionVersion ?? '—' }),
  });
  const notes = data.correctionsFor(ids);
  if (notes.length === 0) return parts;
  const box = el(doc, 'aside', { class: 'correction', role: 'note', 'aria-label': t('correction_title') });
  box.append(el(doc, 'strong', { text: `${t('correction_title')}: ` }));
  for (const n of notes) box.append(el(doc, 'p', { text: t('correction_note', { version: n.version, note: n.note }) }));
  return el(doc, 'div', {}, parts, box);
}

/** The Cite and Report buttons for a record or source. `cite` is { work, platformTitle, verification }. */
export function actions(ctx, { key, title, cite }) {
  const { doc, t, data } = ctx;
  const bar = el(doc, 'div', { class: 'actions' });
  if (ctx.idb) bar.append(workspaceBlock(ctx, { id: key }));

  const citeBox = el(doc, 'details', { class: 'cite' });
  citeBox.append(el(doc, 'summary', { text: t('cite_button') }));
  citeBox.append(
    el(doc, 'h3', { text: t('cite_work') }),
    el(doc, 'p', { class: 'citation', id: 'cite-work', text: cite.work }),
  );
  const url = new URL(ctx.href(ctx.data.pathOf(key) ?? '/'), ctx.origin).href;
  const platform = chicagoPlatform({
    title: cite.platformTitle,
    collectionVersion: data.site.collectionVersion ?? '—',
    url,
    accessed: ctx.now(),
    appName: t('app_title'),
  });
  citeBox.append(
    el(doc, 'h3', { text: t('cite_platform') }),
    el(doc, 'p', { class: 'citation', id: 'cite-platform', text: platform }),
  );
  if (needsLocatorWarning(cite.verification)) {
    citeBox.append(
      el(
        doc,
        'p',
        { class: 'warning', role: 'note', id: 'cite-warning' },
        el(doc, 'strong', { text: `${t('warning_label')}: ` }),
        t('cite_unverified_warning'),
      ),
    );
  }
  citeBox.append(copyButton(ctx, t('cite_copy'), () => `${cite.work}\n\n${platform}`));

  const reportBox = el(doc, 'details', { class: 'report' });
  reportBox.append(el(doc, 'summary', { text: t('report_button') }));
  const area = el(doc, 'textarea', { id: 'report-free', rows: '4' });
  const message = el(doc, 'textarea', {
    id: 'report-message',
    rows: '9',
    readonly: true,
    'aria-label': t('report_message_label'),
  });
  const refresh = () => {
    message.value = buildReportMessage({
      key,
      title,
      collectionVersion: data.site.collectionVersion ?? '—',
      appVersion: ctx.appVersion,
      free: area.value,
    });
    const mailto = reportMailto(data.site.contactAddress, `Theology Research Reader: ${key}`, message.value);
    if (mailLink !== null) mailLink.href = mailto ?? '#';
  };
  const mailLink = data.site.contactAddress
    ? el(doc, 'a', { href: '#', id: 'report-mail', text: t('report_mail') })
    : null;
  area.addEventListener('input', refresh);
  reportBox.append(
    el(doc, 'label', { for: 'report-free', text: t('report_free_label') }),
    area,
    el(doc, 'label', { for: 'report-message', text: t('report_message_label') }),
    message,
    copyButton(ctx, t('report_copy'), () => message.value),
    mailLink,
    mailLink === null ? el(doc, 'p', { class: 'hint', text: t('report_no_address') }) : null,
  );
  refresh();
  const print = el(doc, 'button', { type: 'button', id: 'print-page', text: t('print_button') });
  print.addEventListener('click', () => window.print());
  // Shown only on paper: the two citations, so a printed page can be cited.
  const printed = el(
    doc,
    'div',
    { class: 'print-only', id: 'print-citations' },
    el(doc, 'h2', { text: t('cite_button') }),
    el(doc, 'p', { text: cite.work }),
    el(doc, 'p', { text: platform }),
  );
  bar.append(el(doc, 'p', { class: 'print-row' }, print), printed);
  const ask = askAiBlock(ctx, { id: key });
  bar.append(citeBox, ...(ask ? [ask] : []), reportBox);
  return bar;
}

function copyButton(ctx, label, getText) {
  const { doc, t } = ctx;
  const status = el(doc, 'span', { class: 'copied', role: 'status' });
  const button = el(doc, 'button', { type: 'button', text: label });
  button.addEventListener('click', async () => {
    try {
      await globalThis.navigator.clipboard.writeText(getText());
      status.textContent = ` ${t('diag_copied')}`;
    } catch {
      status.textContent = ` ${t('copy_failed')}`;
    }
  });
  return el(doc, 'span', {}, button, status);
}

const recordBadges = (ctx, record) => {
  const { doc, t } = ctx;
  return el(
    doc,
    'p',
    { class: 'badges' },
    badge(doc, t, 'state', record.state),
    ' ',
    badge(doc, t, 'verification', record.verification?.quotations ?? 'unstated'),
    ' ',
    badge(doc, t, 'pages', record.verification?.pages ?? 'unstated'),
    record.role ? [' ', badge(doc, t, 'role', record.role)] : null,
  );
};

/** Claims and quotations of a record, each with its id, its locator and the locator's verification status. */
function unitsOf(ctx, record) {
  const { doc, t, data } = ctx;
  const out = [];
  const claims = data.claimsOf(record.key);
  if (claims.length > 0) {
    out.push(el(doc, 'h2', { text: t('record_claims') }));
    const list = el(doc, 'ol', { id: 'record-claims' });
    for (const c of claims) {
      const item = el(doc, 'li', { id: c.id });
      item.append(richText(doc, c.text), ' ', badge(doc, t, 'pages', record.verification?.pages ?? 'unstated'));
      list.append(item);
    }
    out.push(list);
  }
  const quotes = data.quotationsOf(record.key);
  if (quotes.length > 0) {
    out.push(el(doc, 'h2', { text: t('record_quotations') }));
    const list = el(doc, 'ul', { id: 'record-quotations' });
    for (const q of quotes) {
      const item = el(doc, 'li', { id: q.id });
      item.append(el(doc, 'q', { text: q.text }));
      if (q.locator) item.append(` (${q.locator})`);
      item.append(' ', badge(doc, t, 'verification', record.verification?.quotations ?? 'unstated'));
      if (q.caveat) item.append(` — ${q.caveat}`);
      if (q.limitedBy) item.append(` ${t('quotation_shortened')}`);
      list.append(item);
    }
    out.push(list);
  }
  return out;
}

function creatorsText(citation) {
  return (citation.creators ?? [])
    .map((c) => `${c.display_name ?? c.name}${c.role && c.role !== 'author' ? ` (${c.role})` : ''}`)
    .join('; ');
}

function editionHistory(ctx, citation) {
  const { t } = ctx;
  const d = citation.dates ?? {};
  const lines = [];
  if (d.original) lines.push(t('edition_original', { year: d.original }));
  if (d.edition) lines.push(t('edition_edition', { year: d.edition.year, label: d.edition.label ?? '' }).trim());
  if (d.reprints?.length) lines.push(t('edition_reprints', { years: d.reprints.join(', ') }));
  if (d.digital_printing) lines.push(t('edition_digital', { year: d.digital_printing }));
  if (citation.edition_statement) lines.push(citation.edition_statement);
  return lines;
}

/**
 * "My copies": links that open the reader's own copy in Zotero or Calibre, shown only when the private library map is available (on the
 * reader's own machine). The links open programs on this computer; the browser may ask permission the first time.
 */
export function myCopiesBlock(ctx, sourceId) {
  const { doc, t } = ctx;
  const links = linksFor(ctx.myLibrary, sourceId);
  const format = openFormat(ctx.myLibrary, sourceId);
  if (links.length === 0 && format === null) return null;
  const box = el(doc, 'section', { id: 'my-copies', class: 'my-copies', 'aria-labelledby': 'my-copies-heading' });
  box.append(
    el(doc, 'h2', { id: 'my-copies-heading', text: t('lib_title') }),
    el(doc, 'p', { class: 'hint', text: t('lib_note') }),
  );
  const status = el(doc, 'p', { id: 'my-copies-status', class: 'hint', role: 'status' });
  if (format !== null) {
    const button = el(doc, 'button', {
      type: 'button',
      id: 'open-my-copy',
      text: t('lib_open', { format: format.toUpperCase() }),
    });
    button.addEventListener('click', async () => {
      status.textContent = '';
      const result = await openCopy(ctx.myLibrary, sourceId, { baseUrl: ctx.baseUrl });
      status.textContent = result.ok ? t('lib_opened') : t('lib_failed');
    });
    box.append(el(doc, 'p', {}, button));
  }
  for (const l of links) {
    box.append(
      el(
        doc,
        'p',
        {},
        el(doc, 'a', { href: l.url, rel: 'noopener', 'data-external': l.kind, text: t('lib_zotero_item') }),
      ),
    );
  }
  box.append(status);
  return box;
}

/** The publication landing page (D11): header, argument at a glance, chapters, intellectual content, reception, development. */
export function renderPublication(ctx, id) {
  const { doc, t, data } = ctx;
  const source = data.sources.get(id);
  const main = el(doc, 'article');
  if (source === undefined) return notFound(ctx);
  const citation = source.citation ?? {};
  const own = data.records.get(id) ?? null;
  const chapters = data.chaptersOf(id);

  main.append(el(doc, 'h1', { id: 'page-heading' }, richText(doc, citation.title ?? id)));
  main.append(
    el(
      doc,
      'p',
      { class: 'badges' },
      badge(doc, t, 'state', source.state),
      ' ',
      badge(doc, t, 'status', citation.status === 'confirmed' ? 'confirmed' : 'suggested'),
      ' ',
      own
        ? [
            badge(doc, t, 'verification', own.verification?.quotations ?? 'unstated'),
            ' ',
            badge(doc, t, 'pages', own.verification?.pages ?? 'unstated'),
          ]
        : null,
    ),
  );

  main.append(el(doc, 'h2', { text: t('pub_details') }));
  main.append(el(doc, 'p', { id: 'bibliography', class: 'citation', text: chicagoWork(citation) }));
  const dl = el(doc, 'dl', { id: 'pub-details' });
  const row = (label, ...value) => dl.append(el(doc, 'dt', { text: label }), el(doc, 'dd', {}, ...value));
  if (citation.creators?.length) row(t('pub_creators'), creatorsText(citation));
  const history = editionHistory(ctx, citation);
  if (history.length)
    row(
      t('pub_editions'),
      el(
        doc,
        'ul',
        {},
        history.map((h) => el(doc, 'li', { text: h })),
      ),
    );
  if (citation.publication?.publisher)
    row(t('pub_publisher'), [citation.publication.place, citation.publication.publisher].filter(Boolean).join(': '));
  row(
    t('pub_rights'),
    t('pub_rights_value', {
      state: t(`badge_state_${source.state}`),
      class: t(`rights_class_${source.class ?? 'undecided'}`),
    }),
  );
  if (own)
    row(
      t('pub_verification'),
      badge(doc, t, 'verification', own.verification?.quotations ?? 'unstated'),
      ' ',
      badge(doc, t, 'pages', own.verification?.pages ?? 'unstated'),
    );
  main.append(dl);
  const copies = myCopiesBlock(ctx, id);
  if (copies) main.append(copies);

  if (own) {
    const glance = GLANCE_FIELDS.map((name) => own.fields.find((f) => f.name === name)).find(Boolean);
    if (glance) main.append(el(doc, 'h2', { text: t('pub_glance') }), textBlock(doc, glance.value, { id: 'glance' }));
  }

  if (chapters.length > 0) {
    main.append(el(doc, 'h2', { text: t('pub_chapters') }));
    const list = el(doc, 'ol', { id: 'chapter-list', class: 'chapters' });
    for (const chapter of chapters) {
      list.append(
        el(
          doc,
          'li',
          {},
          linkTo(doc, ctx, chapter.key, chapter.title ?? chapter.key),
          ' ',
          badge(doc, t, 'state', chapter.state),
          ' ',
          badge(doc, t, 'verification', chapter.verification?.quotations ?? 'unstated'),
        ),
      );
    }
    main.append(list);
  } else if (own) {
    main.append(...unitsOf(ctx, own));
  }

  const content = data.contentFor(id);
  if (content.arguments.length + content.concepts.length + content.positions.length > 0) {
    main.append(el(doc, 'h2', { text: t('pub_content') }));
    for (const [label, list] of [
      [t('pub_arguments'), content.arguments],
      [t('pub_concepts'), content.concepts],
      [t('pub_positions'), content.positions],
    ]) {
      if (list.length === 0) continue;
      main.append(el(doc, 'h3', { text: label }));
      main.append(
        el(
          doc,
          'ul',
          {},
          list.map((item) =>
            el(
              doc,
              'li',
              {},
              linkTo(doc, ctx, item.id, item.title ?? item.name ?? item.id),
              ' ',
              badge(doc, t, 'status', item.status),
              item.provenance?.drafted_by?.includes('AI-assisted') ? [' ', aiBadge(doc, t)] : null,
            ),
          ),
        ),
      );
    }
  }

  const reception = relatedSection(doc, ctx, data.reception(id), { title: t('pub_reception') });
  main.append(
    reception ??
      el(
        doc,
        'section',
        {},
        el(doc, 'h2', { text: t('pub_reception') }),
        el(doc, 'p', { class: 'hint', text: t('pub_nothing_yet') }),
      ),
  );
  const development = relatedSection(doc, ctx, data.development(id), { title: t('pub_development') });
  if (development) {
    development.querySelector('[id]')?.setAttribute('id', 'development-heading');
    main.append(development);
  } else
    main.append(
      el(
        doc,
        'section',
        {},
        el(doc, 'h2', { text: t('pub_development') }),
        el(doc, 'p', { class: 'hint', text: t('pub_nothing_yet') }),
      ),
    );

  const unique = main.querySelectorAll('[id="related-heading"]');
  unique.forEach((node, index) => index > 0 && node.removeAttribute('id'));
  main.append(metaLine(ctx, data.idsOfSource(id)));
  main.append(
    actions(ctx, {
      key: id,
      title: citation.title,
      cite: { work: chicagoWork(citation), platformTitle: citation.title ?? id, verification: own?.verification },
    }),
  );
  return main;
}

/** A chapter (or any record that is not the source-level one). */
export function renderChapter(ctx, key) {
  const { doc, t, data } = ctx;
  const record = data.records.get(key);
  if (record === undefined) return notFound(ctx);
  const source = data.sources.get(record.source);
  const main = el(doc, 'article');
  main.append(
    el(
      doc,
      'p',
      { class: 'crumb' },
      el(
        doc,
        'a',
        { href: ctx.href(`/publication/${encodeURIComponent(record.source)}`), 'data-link': true },
        '← ',
        richText(doc, source?.citation?.title ?? record.source),
      ),
    ),
  );
  main.append(el(doc, 'h1', { id: 'page-heading' }, richText(doc, record.title ?? source?.citation?.title ?? key)));
  if (record.chapterNumber !== null && record.chapterNumber !== undefined)
    main.append(el(doc, 'p', { class: 'meta', text: t('chapter_number', { number: record.chapterNumber }) }));
  main.append(recordBadges(ctx, record));
  const fields = el(doc, 'dl', { id: 'record-fields' });
  for (const f of record.fields) {
    fields.append(el(doc, 'dt', { text: f.name }));
    fields.append(el(doc, 'dd', {}, textBlock(doc, f.value)));
  }
  main.append(fields, ...unitsOf(ctx, record));
  const copies = myCopiesBlock(ctx, record.source);
  if (copies) main.append(copies);
  const groups = data.related([key, ...data.claimsOf(key).map((c) => c.id)]);
  const rel = relatedSection(doc, ctx, groups);
  if (rel) main.append(rel);
  main.append(metaLine(ctx, [key, ...data.claimsOf(key).map((c) => c.id), ...data.quotationsOf(key).map((q) => q.id)]));
  const authors = (record.authors?.ids ?? []).map((id) => data.titleOf(id));
  main.append(
    actions(ctx, {
      key,
      title: record.title ?? key,
      cite: {
        work: chicagoWork(source?.citation ?? {}, record, { chapterAuthors: authors }),
        platformTitle: record.title ?? key,
        verification: record.verification,
      },
    }),
  );
  return main;
}

export function claimItem(ctx, id) {
  const { doc, t, data } = ctx;
  const claim = data.claims.get(id);
  const li = el(doc, 'li', { id: `unit-${id}` });
  if (claim === undefined) return el(doc, 'li', { text: id });
  const record = data.records.get(claim.record);
  li.append(
    richText(doc, claim.text),
    ' ',
    el(doc, 'a', {
      href: `${ctx.href(`/record/${encodeURIComponent(claim.record)}`)}#${encodeURIComponent(id)}`,
      'data-link': true,
      text: data.titleOf(id),
    }),
    ' ',
    badge(doc, t, 'pages', record?.verification?.pages ?? 'unstated'),
  );
  return li;
}

export const authoredBadges = (ctx, item) => {
  const { doc, t } = ctx;
  return el(
    doc,
    'p',
    { class: 'badges' },
    badge(doc, t, 'status', item.status),
    item.provenance?.drafted_by?.includes('AI-assisted') ? [' ', aiBadge(doc, t)] : null,
    item.basis ? [' ', badge(doc, t, 'basis', item.basis)] : null,
  );
};

export const provenanceNote = (ctx, item) => {
  const { doc, t } = ctx;
  const p = item.provenance ?? {};
  return el(doc, 'p', {
    class: 'meta',
    id: 'provenance',
    text: p.reviewed_by
      ? t('provenance_reviewed', { by: p.reviewed_by, on: p.reviewed_on, drafted: p.drafted_by })
      : t('provenance_unreviewed', { drafted: p.drafted_by ?? '—' }),
  });
};

export function renderArgument(ctx, id) {
  const { doc, t, data } = ctx;
  const a = data.arguments.get(id);
  if (a === undefined) return notFound(ctx);
  const main = el(doc, 'article');
  main.append(el(doc, 'h1', { id: 'page-heading', text: a.title }), authoredBadges(ctx, a), provenanceNote(ctx, a));
  if (a.status === 'suggested')
    main.append(el(doc, 'p', { class: 'warning', role: 'note', id: 'suggested-note', text: t('suggested_note') }));
  const section = (heading, ids, ordered = true) => {
    if (!ids?.length) return;
    main.append(
      el(doc, 'h2', { text: heading }),
      el(
        doc,
        ordered ? 'ol' : 'ul',
        {},
        ids.map((c) => claimItem(ctx, c)),
      ),
    );
  };
  section(t('arg_central'), [a.central_proposition], false);
  section(t('arg_premises'), a.premises);
  main.append(
    el(doc, 'h2', { text: t('arg_reasoning') }),
    el(doc, 'p', { id: 'reasoning', text: a.reasoning.replace(/\s+/g, ' ').trim() }),
  );
  section(t('arg_conclusions'), a.conclusions);
  section(t('arg_qualifications'), a.qualifications, false);
  const responses = [...data.interpretations.values()].filter(
    (i) => (a.critical_responses ?? []).includes(i.id) || [a.central_proposition, ...a.source].includes(i.target?.id),
  );
  if (responses.length) {
    main.append(el(doc, 'h2', { text: t('arg_responses') }));
    main.append(
      el(
        doc,
        'ul',
        {},
        responses.map((i) =>
          el(doc, 'li', {}, `${data.titleOf(i.author.id)}: ${i.text} `, badge(doc, t, 'status', i.status)),
        ),
      ),
    );
  }
  const links = [...(a.related?.concepts ?? []), ...(a.related?.arguments ?? []), ...(a.related?.thinkers ?? [])];
  if (links.length || a.source?.length) {
    main.append(el(doc, 'h2', { text: t('arg_related') }));
    main.append(
      el(
        doc,
        'ul',
        {},
        [...a.source, ...links].filter((x) => data.pathOf(x)).map((x) => el(doc, 'li', {}, linkTo(doc, ctx, x))),
      ),
    );
  }
  main.append(
    metaLine(ctx, [id]),
    actions(ctx, {
      key: id,
      title: a.title,
      cite: {
        work: `${t('app_title')}. “${a.title}.” ${t('cite_argument_note')}`,
        platformTitle: a.title,
        verification: undefined,
      },
    }),
  );
  return main;
}

export function renderConcept(ctx, id) {
  const { doc, t, data } = ctx;
  const c = data.concepts.get(id);
  if (c === undefined) return notFound(ctx);
  const main = el(doc, 'article');
  main.append(el(doc, 'h1', { id: 'page-heading', text: c.name }), authoredBadges(ctx, c), provenanceNote(ctx, c));
  main.append(el(doc, 'h2', { text: t('concept_definition') }), el(doc, 'p', { id: 'definition', text: c.definition }));
  if (c.in_odonovan)
    main.append(
      el(doc, 'h2', { text: t('concept_in_odonovan') }),
      el(doc, 'p', { id: 'in-odonovan', text: c.in_odonovan.replace(/\s+/g, ' ').trim() }),
    );
  if (c.evidence?.length)
    main.append(
      el(doc, 'h2', { text: t('concept_evidence') }),
      el(
        doc,
        'ul',
        {},
        c.evidence.map((e) => claimItem(ctx, e)),
      ),
    );
  const links = [
    ...(c.related?.concepts ?? []),
    ...(c.related?.arguments ?? []),
    ...(c.related?.positions ?? []),
  ].filter((x) => data.pathOf(x));
  if (links.length)
    main.append(
      el(doc, 'h2', { text: t('concept_related') }),
      el(
        doc,
        'ul',
        {},
        links.map((x) => el(doc, 'li', {}, linkTo(doc, ctx, x))),
      ),
    );
  const positions = [...data.positions.values()].filter((p) => p.concept === id);
  if (positions.length > 0) {
    main.append(
      el(doc, 'h2', { text: t('concept_positions') }),
      el(
        doc,
        'ul',
        { id: 'concept-positions' },
        positions.map((p) => el(doc, 'li', {}, linkTo(doc, ctx, p.id), ' ', badge(doc, t, 'status', p.status))),
      ),
    );
    if (positions.length >= 2) {
      main.append(
        el(
          doc,
          'p',
          {},
          el(doc, 'a', {
            href: ctx.href(`/compare?concept=${encodeURIComponent(id)}`),
            'data-link': true,
            id: 'compare-concept-link',
            text: t('pos_compare_all'),
          }),
        ),
      );
    }
  }
  const hub = Object.values(data.hubs).find((h) => h.concept === id);
  if (hub) main.append(renderHubTable(ctx, hub));
  if (c.tag_links?.length)
    main.append(el(doc, 'p', { class: 'tags', text: `${t('record_tags')}: ${c.tag_links.join('; ')}` }));
  main.append(
    metaLine(ctx, [id]),
    actions(ctx, {
      key: id,
      title: c.name,
      cite: {
        work: `${t('app_title')}. “${c.name}.” ${t('cite_concept_note')}`,
        platformTitle: c.name,
        verification: undefined,
      },
    }),
  );
  return main;
}

function personWorks(ctx, id) {
  const { doc, t, data } = ctx;
  const works = data.worksBy(id);
  if (works.size === 0) return null;
  const list = el(doc, 'ul', { id: 'works' });
  for (const [sourceId, recs] of works)
    list.append(el(doc, 'li', {}, linkTo(doc, ctx, sourceId), ` (${t('works_records', { count: recs.length })})`));
  return el(doc, 'section', {}, el(doc, 'h2', { text: t('person_works') }), list);
}

/** Thinker page: O’Donovan, anchors and historical figures. The section "In O’Donovan" is the scoped view (D12). */
export function renderThinker(ctx, id) {
  const { doc, t, data } = ctx;
  const p = data.thinkers.get(id);
  if (p === undefined) return notFound(ctx);
  const main = el(doc, 'article');
  main.append(el(doc, 'h1', { id: 'page-heading', text: p.display_name ?? p.name }));
  main.append(el(doc, 'p', { class: 'meta', text: [t(`kind_${p.kind}`), p.dates].filter(Boolean).join(' · ') }));
  const mentions = data.related([id]);
  const isOdonovan = p.kind === 'o_donovan';
  if (!isOdonovan) {
    main.append(el(doc, 'p', { class: 'hint', text: t('thinker_scoped_note') }));
    main.append(el(doc, 'h2', { text: t('thinker_in_odonovan') }));
    const rel = relatedSection(doc, ctx, mentions, { headingLevel: 3, title: t('related_title') });
    main.append(rel ?? el(doc, 'p', { class: 'hint', text: t('pub_nothing_yet') }));
  }
  const works = personWorks(ctx, id);
  if (works) main.append(works);
  const touching = [...data.arguments.values()].filter((a) => a.related?.thinkers?.includes(id));
  if (touching.length)
    main.append(
      el(doc, 'h2', { text: t('person_arguments') }),
      el(
        doc,
        'ul',
        {},
        touching.map((a) => el(doc, 'li', {}, linkTo(doc, ctx, a.id), ' ', badge(doc, t, 'status', a.status))),
      ),
    );
  const positions = [...data.positions.values()].filter((x) => x.holder?.id === id);
  if (positions.length)
    main.append(
      el(doc, 'h2', { text: t('pub_positions') }),
      el(
        doc,
        'ul',
        {},
        positions.map((x) => el(doc, 'li', { text: x.id })),
      ),
    );
  main.append(
    metaLine(ctx, [id]),
    actions(ctx, {
      key: id,
      title: p.name,
      cite: {
        work: `${t('app_title')}. “${p.name}.” ${t('cite_person_note')}`,
        platformTitle: p.name,
        verification: undefined,
      },
    }),
  );
  return main;
}

/** Scholar author page: works, and what they engage. */
export function renderScholar(ctx, id) {
  const { doc, t, data } = ctx;
  const p = data.thinkers.get(id);
  if (p === undefined) return notFound(ctx);
  const main = el(doc, 'article');
  main.append(
    el(doc, 'h1', { id: 'page-heading', text: p.display_name ?? p.name }),
    el(doc, 'p', { class: 'meta', text: t('kind_scholar') }),
  );
  const works = personWorks(ctx, id);
  main.append(works ?? el(doc, 'p', { class: 'hint', text: t('pub_nothing_yet') }));
  const workIds = [...data.worksBy(id).values()].flat().map((r) => r.key);
  const engaged = data.related(workIds, {
    exclude: (other) => workIds.includes(other) || (data.sourceOfId(other) === null && !data.thinkers.has(other)),
  });
  const rel = relatedSection(doc, ctx, engaged, { title: t('scholar_engages') });
  if (rel) main.append(rel);
  main.append(
    metaLine(ctx, [id]),
    actions(ctx, {
      key: id,
      title: p.name,
      cite: {
        work: `${t('app_title')}. “${p.name}.” ${t('cite_person_note')}`,
        platformTitle: p.name,
        verification: undefined,
      },
    }),
  );
  return main;
}

export function renderAbout(ctx) {
  const { doc, t } = ctx;
  const main = el(doc, 'article', { id: 'about' });
  main.append(el(doc, 'h1', { id: 'page-heading', text: t('about_title') }));
  main.append(el(doc, 'p', { text: t('about_intro') }));
  main.append(el(doc, 'h2', { text: t('about_framework_title') }), el(doc, 'p', { text: t('about_framework') }));
  main.append(el(doc, 'h2', { text: t('about_layers_title') }), el(doc, 'p', { text: t('about_layers') }));
  main.append(el(doc, 'h2', { text: t('about_statuses_title') }));
  const dl = el(doc, 'dl', { id: 'status-meanings' });
  for (const [kind, values] of [
    ['status', ['explicit', 'editorially_identified', 'suggested', 'editorially_confirmed', 'confirmed']],
    ['verification', ['print_checked', 'text_checked', 'unchecked', 'unstated']],
    ['pages', ['checked', 'checked_in_text', 'estimated', 'unchecked', 'unstated']],
    ['state', ['listed', 'summarised']],
    ['role', ['odonovan_own', 'scholarship', 'sourcebook']],
    ['basis', ['explicit', 'reconstructed']],
  ]) {
    for (const v of values)
      dl.append(el(doc, 'dt', {}, badge(doc, t, kind, v)), el(doc, 'dd', { text: t(`meaning_${kind}_${v}`) }));
  }
  dl.append(el(doc, 'dt', {}, aiBadge(doc, t)), el(doc, 'dd', { text: t('meaning_ai') }));
  main.append(dl);
  main.append(el(doc, 'h2', { text: t('about_rights_title') }), el(doc, 'p', { text: t('about_rights') }));
  main.append(el(doc, 'h2', { text: t('about_takedown_title') }));
  const address = ctx.data.site.contactAddress;
  main.append(
    el(
      doc,
      'p',
      { id: 'takedown' },
      address
        ? [t('about_takedown_with'), ' ', el(doc, 'a', { href: `mailto:${address}`, text: address })]
        : t('about_takedown_without'),
    ),
  );
  main.append(
    el(
      doc,
      'p',
      {},
      el(doc, 'a', { href: ctx.href('/privacy'), 'data-link': true, id: 'privacy-link', text: t('priv_link') }),
    ),
  );
  main.append(
    el(doc, 'p', {
      class: 'meta',
      text: t('meta_revised', { date: ctx.data.site.released ?? '—', version: ctx.data.site.collectionVersion ?? '—' }),
    }),
  );
  return main;
}

export function renderPrivacy(ctx) {
  const { doc, t } = ctx;
  const main = el(doc, 'article', { id: 'privacy' });
  main.append(
    el(doc, 'h1', { id: 'page-heading', text: t('priv_title') }),
    el(doc, 'p', { class: 'meta', text: t('priv_updated') }),
  );
  for (const section of ['stores', 'sends', 'host', 'backups', 'ai', 'children', 'contact']) {
    main.append(
      el(doc, 'h2', { text: t(`priv_${section}_title`) }),
      el(doc, 'p', { id: `priv-${section}`, text: t(`priv_${section}`) }),
    );
  }
  return main;
}

export function notFound(ctx) {
  const { doc, t } = ctx;
  return el(
    doc,
    'section',
    {},
    el(doc, 'h1', { id: 'page-heading', text: t('not_found') }),
    el(doc, 'p', {}, el(doc, 'a', { href: ctx.href('/'), 'data-link': true, text: t('nav_home') })),
  );
}
