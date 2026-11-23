// "Import a collection file": the reader chooses a collection zip (a closed-testing bundle sent privately, or an offline update) and
// the app checks and installs it exactly like a download (collection.js). It never fetches anything. Also lets the reader go back
// to the online collection when an imported one is in use.

import { importCollection, useOnlineCollection } from './collection.js';
import { el } from './ui.js';

const KNOWN_ERRORS = new Set([
  'not_a_collection',
  'format_too_new',
  'bad_file_hash',
  'unsafe_name',
  'too_many_entries',
  'entry_too_large',
  'total_too_large',
  'ratio_too_high',
  'missing_entry',
  'unsafe_manifest',
]);

export function importBlock(ctx, { current = null } = {}) {
  const { doc, t } = ctx;
  const box = el(doc, 'section', { id: 'import', class: 'backup' });
  box.append(el(doc, 'h2', { text: t('import_title') }), el(doc, 'p', { class: 'hint', text: t('import_note') }));
  const status = el(doc, 'p', { id: 'import-status', role: 'status' });
  const file = el(doc, 'input', { type: 'file', id: 'import-file', accept: '.zip', 'aria-label': t('import_label') });
  const actions = el(doc, 'p', { id: 'import-actions' });
  file.addEventListener('change', async () => {
    const chosen = file.files[0];
    if (!chosen) return;
    actions.replaceChildren();
    status.textContent = t('import_working');
    try {
      const result = await importCollection({
        idb: ctx.idb,
        JSZip: globalThis.JSZip,
        bytes: new Uint8Array(await chosen.arrayBuffer()),
      });
      if (result.same) {
        status.textContent = t('import_same', { version: result.meta.version });
        return;
      }
      status.textContent = t(result.activated ? 'import_done_now' : 'import_done_next', {
        version: result.meta.version,
        sources: '',
      }).replace('  ', ' ');
      const reload = el(doc, 'button', { type: 'button', id: 'import-reload', text: t('import_open_now') });
      reload.addEventListener('click', () => window.location.assign(ctx.href('/')));
      actions.append(reload);
    } catch (error) {
      ctx.errorLog?.record(error, 'import');
      const code = KNOWN_ERRORS.has(error.code) ? error.code : 'not_a_collection';
      status.textContent = t(`import_error_${code}`);
    }
  });
  box.append(el(doc, 'label', { for: 'import-file', text: t('import_label') }), file, actions, status);
  if (current?.sideloaded) {
    box.append(el(doc, 'p', { id: 'import-current', text: t('import_current', { version: current.version }) }));
    const online = el(doc, 'button', { type: 'button', id: 'use-online', text: t('import_use_online') });
    online.addEventListener('click', async () => {
      if (!ctx.confirm(t('import_confirm_online'))) return;
      await useOnlineCollection({ idb: ctx.idb });
      window.location.assign(ctx.href('/'));
    });
    box.append(online);
  }
  return box;
}
