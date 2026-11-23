// The workspace pages and the notes block shown on record pages (stage 7). All data stays on the device (workspace.js).
// Pages are built at once and filled in when the stored data has been read, so a slow read never blocks the page.

import { exportJson, exportMarkdown } from './export.js';
import { buildBackup, restoreBackup } from './backup.js';
import * as w from './workspace.js';
import { el, linkTo } from './ui.js';

/** Saves text as a file in the browser (no server involved). */
export function downloadText(doc, filename, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const link = el(doc, 'a', { href: url, download: filename });
  doc.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadBytes(doc, filename, bytes, type = 'application/zip') {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const link = el(doc, 'a', { href: url, download: filename });
  doc.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stamp = (now = new Date()) => now.toISOString().slice(0, 10);

/** Runs an async action and reports a failure on the page rather than losing it. */
const safe =
  (ctx, node, work) =>
  async (...args) => {
    try {
      await work(...args);
    } catch (error) {
      ctx.errorLog?.record(error, 'workspace');
      node.append(el(ctx.doc, 'p', { class: 'warning', role: 'alert', text: ctx.t('ws_error') }));
    }
  };

function noteItem(ctx, note, refresh) {
  const { doc, t, data } = ctx;
  const target = w.resolveTarget(data, note.fields.target);
  const item = el(doc, 'li', { class: 'note', 'data-note': note.key });
  const head = el(doc, 'p', { class: 'meta' }, el(doc, 'span', { class: 'reference', text: target.reference }), ' ');
  head.append(
    target.exists && target.path !== null
      ? linkTo(doc, ctx, note.fields.target, target.title)
      : el(doc, 'span', { class: 'missing', text: t('ws_target_gone') }),
  );
  item.append(head, el(doc, 'p', { class: 'note-text', text: note.fields.text }));
  const edit = el(doc, 'button', { type: 'button', text: t('ws_edit') });
  const remove = el(doc, 'button', { type: 'button', text: t('ws_delete') });
  edit.addEventListener('click', () => {
    const area = el(doc, 'textarea', { rows: '4', 'aria-label': t('ws_note_label') });
    area.value = note.fields.text;
    const save = el(doc, 'button', { type: 'button', text: t('ws_save') });
    save.addEventListener(
      'click',
      safe(ctx, item, async () => {
        if (area.value.trim() === '') return;
        await w.updateNote({ idb: ctx.idb, key: note.key, text: area.value });
        await refresh();
      }),
    );
    item.replaceChildren(head, area, save);
  });
  remove.addEventListener(
    'click',
    safe(ctx, item, async () => {
      if (!ctx.confirm(t('ws_confirm_delete_note'))) return;
      await w.deleteNote({ idb: ctx.idb, key: note.key });
      await refresh();
    }),
  );
  item.append(el(doc, 'p', {}, edit, ' ', remove));
  return item;
}

/**
 * The block on a record page: bookmark, progress, add to project, and the notes on this item and its claims. `targets` are
 * the ids a note may be written on (the item itself first).
 */
export function workspaceBlock(ctx, { id, targets = [id] }) {
  const { doc, t, data } = ctx;
  const block = el(doc, 'section', {
    class: 'workspace',
    id: 'workspace-block',
    'aria-labelledby': 'workspace-heading',
  });
  block.append(el(doc, 'h2', { id: 'workspace-heading', text: t('ws_mine') }));
  const body = el(doc, 'div');
  block.append(body);

  async function refresh() {
    const bookmarked = await w.isBookmarked(ctx.idb, id);
    const progress = await w.getProgress(ctx.idb, id);
    const projects = await w.listProjects(ctx.idb);
    const inProjects = new Set((await w.projectsContaining(ctx.idb, id)).map((p) => p.key));
    const notes = await w.listNotes(ctx.idb, { targets: [...targets, ...data.claimsOf(id).map((c) => c.id)] });
    const bar = el(doc, 'p', { class: 'ws-bar' });

    const bm = el(doc, 'button', {
      type: 'button',
      id: 'bookmark-toggle',
      'aria-pressed': String(bookmarked),
      text: bookmarked ? t('ws_bookmark_remove') : t('ws_bookmark_add'),
    });
    bm.addEventListener(
      'click',
      safe(ctx, body, async () => {
        await w.toggleBookmark({ idb: ctx.idb, target: id });
        await refresh();
      }),
    );
    const prog = el(doc, 'select', { id: 'progress-select', 'aria-label': t('ws_progress') });
    for (const state of w.PROGRESS_STATES) {
      const option = el(doc, 'option', { value: state, text: t(`ws_progress_${state}`) });
      if (state === progress) option.selected = true;
      prog.append(option);
    }
    prog.addEventListener(
      'change',
      safe(ctx, body, async () => w.setProgress({ idb: ctx.idb, target: id, state: prog.value })),
    );
    bar.append(
      bm,
      ' ',
      el(doc, 'label', { for: 'progress-select', class: 'inline', text: `${t('ws_progress')}: ` }),
      prog,
    );
    if (projects.length > 0) {
      const sel = el(doc, 'select', { id: 'project-select', 'aria-label': t('ws_add_to_project') });
      sel.append(el(doc, 'option', { value: '', text: t('ws_add_to_project') }));
      for (const p of projects)
        sel.append(el(doc, 'option', { value: p.key, text: `${p.fields.title}${inProjects.has(p.key) ? ` ✓` : ''}` }));
      sel.addEventListener(
        'change',
        safe(ctx, body, async () => {
          if (sel.value === '') return;
          if (inProjects.has(sel.value)) await w.removeFromProject({ idb: ctx.idb, projectKey: sel.value, target: id });
          else await w.addToProject({ idb: ctx.idb, projectKey: sel.value, target: id });
          await refresh();
        }),
      );
      bar.append(' ', sel);
    }

    const form = el(doc, 'form', { id: 'note-form' });
    const area = el(doc, 'textarea', { id: 'note-text', rows: '3' });
    form.append(el(doc, 'label', { for: 'note-text', text: t('ws_new_note') }), area);
    let select = null;
    if (targets.length > 1 || data.claimsOf(id).length > 0) {
      select = el(doc, 'select', { id: 'note-target', 'aria-label': t('ws_note_on') });
      select.append(el(doc, 'option', { value: id, text: t('ws_note_on_this') }));
      for (const c of data.claimsOf(id))
        select.append(el(doc, 'option', { value: c.id, text: t('ws_note_on_claim', { number: c.number ?? '' }) }));
      form.append(select);
    }
    form.append(el(doc, 'button', { type: 'submit', text: t('ws_add_note') }));
    form.addEventListener(
      'submit',
      safe(ctx, body, async (event) => {
        event.preventDefault();
        const text = area.value.trim();
        if (text === '') return;
        await w.addNote({ idb: ctx.idb, target: select?.value ?? id, text });
        await refresh();
      }),
    );

    const list = el(doc, 'ul', { id: 'notes-list', class: 'notes' });
    for (const note of notes) list.append(noteItem(ctx, note, refresh));
    body.replaceChildren(
      bar,
      form,
      list.children.length > 0 ? list : el(doc, 'p', { class: 'hint', text: t('ws_no_notes_here') }),
    );
  }
  safe(ctx, body, refresh)();
  return block;
}

/** The workspace page: all notes, bookmarks, projects and progress. */
export function renderWorkspace(ctx) {
  const { doc, t } = ctx;
  const main = el(doc, 'section', { id: 'workspace' });
  main.append(
    el(doc, 'h1', { id: 'page-heading', text: t('ws_title') }),
    el(doc, 'p', { class: 'hint', text: t('ws_local_note') }),
  );
  const body = el(doc, 'div');
  main.append(body);

  async function refresh() {
    const out = [];
    const notes = await w.listNotes(ctx.idb);
    const bookmarks = await w.listBookmarks(ctx.idb);
    const projects = await w.listProjects(ctx.idb);
    const progress = (await w.listProgress(ctx.idb)).filter((p) => p.fields.state !== 'unread');

    out.push(el(doc, 'h2', { text: `${t('ws_projects')} (${projects.length})` }));
    const create = el(doc, 'form', { id: 'project-form' });
    const title = el(doc, 'input', { type: 'text', id: 'project-title', required: true });
    const kind = el(doc, 'select', { id: 'project-kind', 'aria-label': t('ws_project_kind') });
    for (const k of w.PROJECT_KINDS) kind.append(el(doc, 'option', { value: k, text: t(`ws_kind_${k}`) }));
    create.append(
      el(doc, 'label', { for: 'project-title', text: t('ws_project_title') }),
      title,
      kind,
      ' ',
      el(doc, 'button', { type: 'submit', text: t('ws_create_project') }),
    );
    create.addEventListener(
      'submit',
      safe(ctx, body, async (event) => {
        event.preventDefault();
        if (title.value.trim() === '') return;
        await w.createProject({ idb: ctx.idb, title: title.value.trim(), kind: kind.value });
        await refresh();
      }),
    );
    out.push(create);
    out.push(
      el(
        doc,
        'ul',
        { id: 'project-list' },
        projects.map((p) =>
          el(
            doc,
            'li',
            {},
            el(doc, 'a', {
              href: ctx.href(`/project/${encodeURIComponent(p.key.slice('project:'.length))}`),
              'data-link': true,
              text: p.fields.title,
            }),
            ` (${t(`ws_kind_${p.fields.kind}`)})`,
          ),
        ),
      ),
    );

    out.push(el(doc, 'h2', { text: `${t('ws_bookmarks')} (${bookmarks.length})` }));
    out.push(
      bookmarks.length === 0
        ? el(doc, 'p', { class: 'hint', text: t('ws_none_yet') })
        : el(
            doc,
            'ul',
            { id: 'bookmark-list' },
            bookmarks.map((b) =>
              el(
                doc,
                'li',
                {},
                w.resolveTarget(ctx.data, b.fields.target).exists
                  ? linkTo(doc, ctx, b.fields.target)
                  : el(doc, 'span', { class: 'missing', text: `${b.fields.target} — ${t('ws_target_gone')}` }),
              ),
            ),
          ),
    );

    out.push(el(doc, 'h2', { text: `${t('ws_notes')} (${notes.length})` }));
    const list = el(doc, 'ul', { id: 'all-notes', class: 'notes' });
    for (const note of notes) list.append(noteItem(ctx, note, refresh));
    out.push(notes.length === 0 ? el(doc, 'p', { class: 'hint', text: t('ws_none_yet') }) : list);

    out.push(el(doc, 'h2', { text: `${t('ws_progress_title')} (${progress.length})` }));
    out.push(
      progress.length === 0
        ? el(doc, 'p', { class: 'hint', text: t('ws_none_yet') })
        : el(
            doc,
            'ul',
            { id: 'progress-list' },
            progress.map((p) =>
              el(doc, 'li', {}, linkTo(doc, ctx, p.fields.target), ` — ${t(`ws_progress_${p.fields.state}`)}`),
            ),
          ),
    );
    body.replaceChildren(...out);
  }
  safe(ctx, body, refresh)();
  return main;
}

/** One project: question, items, the notes on them, export, delete. */
export function renderProject(ctx, id) {
  const { doc, t, data } = ctx;
  const key = `project:${id}`;
  const main = el(doc, 'section', { id: 'project' });
  const body = el(doc, 'div');
  main.append(
    el(
      doc,
      'p',
      { class: 'crumb' },
      el(doc, 'a', { href: ctx.href('/workspace'), 'data-link': true, text: `← ${t('ws_title')}` }),
    ),
    body,
  );

  async function refresh() {
    const project = await ctx.idb.get('userdata', key);
    if (project === null || project.fields.deleted === true) {
      body.replaceChildren(el(doc, 'h1', { id: 'page-heading', text: t('not_found') }));
      return;
    }
    const items = await w.projectItems(ctx.idb, key);
    const allNotes = await w.listNotes(ctx.idb);
    const out = [
      el(doc, 'h1', { id: 'page-heading', text: project.fields.title }),
      el(doc, 'p', { class: 'meta', text: t(`ws_kind_${project.fields.kind}`) }),
    ];
    const q = el(doc, 'textarea', { id: 'project-question', rows: '2' });
    q.value = project.fields.question ?? '';
    const saveQ = el(doc, 'button', { type: 'button', id: 'save-question', text: t('ws_save_question') });
    saveQ.addEventListener(
      'click',
      safe(ctx, body, async () => {
        await w.updateProject({ idb: ctx.idb, key, fields: { question: q.value } });
        saveQ.textContent = t('ws_saved');
      }),
    );
    out.push(el(doc, 'label', { for: 'project-question', text: t('ws_question') }), q, saveQ);

    out.push(el(doc, 'h2', { text: `${t('ws_items')} (${items.length})` }));
    out.push(
      items.length === 0
        ? el(doc, 'p', { class: 'hint', text: t('ws_none_yet') })
        : el(
            doc,
            'ul',
            { id: 'project-items' },
            items.map((i) => {
              const target = w.resolveTarget(data, i.fields.target);
              const remove = el(doc, 'button', { type: 'button', text: t('ws_remove') });
              remove.addEventListener(
                'click',
                safe(ctx, body, async () => {
                  await w.removeFromProject({ idb: ctx.idb, projectKey: key, target: i.fields.target });
                  await refresh();
                }),
              );
              return el(
                doc,
                'li',
                {},
                target.exists
                  ? linkTo(doc, ctx, i.fields.target)
                  : el(doc, 'span', { class: 'missing', text: `${i.fields.target} — ${t('ws_target_gone')}` }),
                ' ',
                remove,
              );
            }),
          ),
    );

    const mine = allNotes.filter((n) =>
      items.some((i) => i.fields.target === n.fields.target || n.fields.target.startsWith(`${i.fields.target}#`)),
    );
    out.push(el(doc, 'h2', { text: `${t('ws_notes')} (${mine.length})` }));
    const list = el(doc, 'ul', { class: 'notes', id: 'project-notes' });
    for (const note of mine) list.append(noteItem(ctx, note, refresh));
    out.push(mine.length === 0 ? el(doc, 'p', { class: 'hint', text: t('ws_none_yet') }) : list);

    const exportButton = el(doc, 'button', { type: 'button', id: 'export-project', text: t('ws_export_markdown') });
    exportButton.addEventListener(
      'click',
      safe(ctx, body, async () => {
        // Read again: the question may have been edited since the page was drawn.
        const current = await ctx.idb.get('userdata', key);
        const text = exportMarkdown({
          project: current,
          items: await w.projectItems(ctx.idb, key),
          notes: await w.listNotes(ctx.idb),
          data,
          collectionVersion: data.site.collectionVersion ?? '—',
        });
        downloadText(doc, `${current.fields.title.replace(/[^\w-]+/g, '_')}-${stamp()}.md`, text, 'text/markdown');
      }),
    );
    const del = el(doc, 'button', { type: 'button', id: 'delete-project', text: t('ws_delete_project') });
    del.addEventListener(
      'click',
      safe(ctx, body, async () => {
        if (!ctx.confirm(t('ws_confirm_delete_project'))) return;
        await w.deleteProject({ idb: ctx.idb, key });
        ctx.go('/workspace');
      }),
    );
    out.push(el(doc, 'p', {}, exportButton, ' ', del));
    body.replaceChildren(...out);
  }
  safe(ctx, body, refresh)();
  return main;
}

/** The backup, restore and export block on the settings page. */
export function backupBlock(ctx) {
  const { doc, t, data } = ctx;
  const box = el(doc, 'section', { id: 'backup', class: 'backup' });
  const status = el(doc, 'p', { id: 'backup-status', role: 'status' });
  box.append(el(doc, 'h2', { text: t('ws_backup_title') }), el(doc, 'p', { class: 'hint', text: t('ws_backup_note') }));

  const backup = el(doc, 'button', { type: 'button', id: 'backup-now', text: t('ws_backup_now') });
  backup.addEventListener(
    'click',
    safe(ctx, box, async () => {
      const bytes = await buildBackup({ idb: ctx.idb, JSZip: globalThis.JSZip, settings: ctx.settings() });
      downloadBytes(doc, `theology-research-reader-${stamp()}.clbackup`, bytes);
      status.textContent = t('ws_backup_done');
    }),
  );
  const file = el(doc, 'input', {
    type: 'file',
    id: 'restore-file',
    accept: '.clbackup,.zip',
    'aria-label': t('ws_restore_label'),
  });
  file.addEventListener(
    'change',
    safe(ctx, box, async () => {
      const chosen = file.files[0];
      if (!chosen) return;
      try {
        const result = await restoreBackup({
          idb: ctx.idb,
          JSZip: globalThis.JSZip,
          bytes: new Uint8Array(await chosen.arrayBuffer()),
        });
        status.textContent = t('ws_restore_done', { added: result.added, merged: result.merged });
      } catch (error) {
        status.textContent =
          t(`ws_restore_error_${error.code ?? 'bad_format'}`) === `ws_restore_error_${error.code}`
            ? t('ws_restore_error_bad_format')
            : t(`ws_restore_error_${error.code}`);
      }
    }),
  );
  const mdAll = el(doc, 'button', { type: 'button', id: 'export-notes', text: t('ws_export_notes') });
  mdAll.addEventListener(
    'click',
    safe(ctx, box, async () => {
      const notes = await w.listNotes(ctx.idb);
      downloadText(
        doc,
        `my-notes-${stamp()}.md`,
        exportMarkdown({ notes, data, collectionVersion: data.site.collectionVersion ?? '—' }),
        'text/markdown',
      );
    }),
  );
  const jsonAll = el(doc, 'button', { type: 'button', id: 'export-json', text: t('ws_export_json') });
  jsonAll.addEventListener(
    'click',
    safe(ctx, box, async () => {
      const records = {};
      for (const key of await ctx.idb.keys('userdata')) records[key] = await ctx.idb.get('userdata', key);
      downloadText(
        doc,
        `my-data-${stamp()}.json`,
        exportJson({ records, collectionVersion: data.site.collectionVersion ?? '—' }),
        'application/json',
      );
    }),
  );
  const wipe = el(doc, 'button', { type: 'button', id: 'delete-all', text: t('ws_delete_all') });
  wipe.addEventListener(
    'click',
    safe(ctx, box, async () => {
      if (!ctx.confirm(t('ws_confirm_delete_all'))) return;
      const count = await w.deleteEverything(ctx.idb);
      status.textContent = t('ws_deleted_all', { count });
    }),
  );
  box.append(
    el(doc, 'p', {}, backup),
    el(doc, 'label', { for: 'restore-file', text: t('ws_restore_label') }),
    file,
    el(doc, 'p', {}, mdAll, ' ', jsonAll),
    el(doc, 'p', {}, wipe),
    status,
  );
  return box;
}
