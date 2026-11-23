// A minimal record viewer: it proves the collection loads, and shows a record's raw fields. It is not the real reading
// experience (later stages). Everything is built with DOM methods and textContent; record text goes through renderText.

const el = (doc, tag, attrs = {}, ...children) => {
  const node = doc.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (name === 'text') node.textContent = value;
    else node.setAttribute(name, value);
  }
  node.append(...children);
  return node;
};

export function renderSources({ doc, t, ctx }) {
  const main = el(doc, 'section');
  main.append(el(doc, 'h1', { id: 'page-heading', text: t('nav_sources') }));
  const list = el(doc, 'ul', { id: 'source-list' });
  for (const entry of ctx.masterIndex.entries) {
    const creators = entry.creators.map((c) => c.name).join(', ');
    const label = `${entry.title ?? entry.id}${creators ? ` — ${creators}` : ''}${entry.year ? ` (${entry.year})` : ''}`;
    list.append(
      el(
        doc,
        'li',
        {},
        el(doc, 'a', { href: ctx.href(`/publication/${encodeURIComponent(entry.id)}`), 'data-link': '', text: label }),
      ),
    );
  }
  main.append(list);
  return main;
}

export function renderSettings({ doc, t, ctx }) {
  const main = el(doc, 'section');
  main.append(el(doc, 'h1', { id: 'page-heading', text: t('nav_settings') }));
  const select = el(doc, 'select', { id: 'ui-language' });
  for (const [code, name] of Object.entries(ctx.languages)) {
    const option = el(doc, 'option', { value: code, text: name });
    if (code === ctx.uiLanguage) option.selected = true;
    select.append(option);
  }
  main.append(el(doc, 'label', { for: 'ui-language', text: t('settings_ui_language') }), select);
  main.append(
    el(doc, 'p', { class: 'hint', text: t('settings_content_language_note', { language: ctx.contentLanguage }) }),
  );
  const storage = el(doc, 'p', { id: 'storage-use' });
  storage.textContent = t('settings_storage', { used: ctx.storageText });
  main.append(storage);
  return main;
}

export function renderNotFound({ doc, t, ctx }) {
  return el(
    doc,
    'section',
    {},
    el(doc, 'h1', { text: t('not_found') }),
    el(doc, 'p', {}, el(doc, 'a', { href: ctx.href('/'), 'data-link': '', text: t('nav_home') })),
  );
}

export function renderDiagnostics({ doc, t, report }) {
  const main = el(doc, 'section');
  main.append(el(doc, 'h1', { id: 'page-heading', text: t('nav_diagnostics') }));
  main.append(el(doc, 'pre', { id: 'diagnostics-report', text: report }));
  main.append(el(doc, 'button', { type: 'button', id: 'copy-report', text: t('diag_copy') }));
  return main;
}
