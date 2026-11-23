// Export of personal data (stage 7): Markdown for reading and JSON for exact copies. Every note carries a clear reference to its
// record or claim and the collection version it was written against. Pure functions: they return text.

import { referenceOf, resolveTarget } from './workspace.js';

const quoteBlock = (text) =>
  text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
const dateOf = (ms) => (typeof ms === 'number' ? new Date(ms).toISOString().slice(0, 10) : '');

function noteBlock(note, data, collectionVersion) {
  const target = resolveTarget(data, note.fields.target);
  const lines = [`### ${target.exists ? target.title : note.fields.target}`, ''];
  lines.push(`- Reference: \`${referenceOf(note.fields.target)}\``);
  lines.push(`- Collection version: ${collectionVersion}`);
  if (note.fields.createdAt) lines.push(`- Written: ${dateOf(note.fields.createdAt)}`);
  if (!target.exists)
    lines.push('- **This target no longer exists in the collection version above.** The note is kept as written.');
  lines.push('', quoteBlock(note.fields.text), '');
  return lines.join('\n');
}

/**
 * Markdown for one project (with its items and the notes on them), or for all notes when `project` is null.
 * `items` are the project's items; `notes` all live notes.
 */
export function exportMarkdown({ project = null, items = [], notes, data, collectionVersion, now = new Date() }) {
  const out = [];
  out.push(project === null ? '# My notes' : `# ${project.fields.title}`, '');
  out.push(
    `Exported ${now.toISOString().slice(0, 10)} from the Theology Research Reader. Collection version: ${collectionVersion}.`,
    '',
  );
  if (project !== null) {
    if (project.fields.question) out.push(`**Research question:** ${project.fields.question}`, '');
    out.push(`## Items (${items.length})`, '');
    for (const item of items) {
      const target = resolveTarget(data, item.fields.target);
      out.push(
        `- ${target.exists ? target.title : item.fields.target} (\`${referenceOf(item.fields.target)}\`)${target.exists ? '' : ' — target no longer exists'}`,
      );
    }
    out.push('');
  }
  const wanted =
    project === null
      ? notes
      : notes.filter((n) =>
          items.some((i) => i.fields.target === n.fields.target || n.fields.target.startsWith(`${i.fields.target}#`)),
        );
  out.push(`## Notes (${wanted.length})`, '');
  for (const note of wanted) out.push(noteBlock(note, data, collectionVersion));
  return `${out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()}\n`;
}

/** Every workspace record, exactly as stored (ids and per-field timestamps included), with the collection version. */
export function exportJson({ records, collectionVersion, now = new Date() }) {
  return `${JSON.stringify({ format: 1, exportedAt: now.toISOString(), collectionVersion, records }, null, 2)}\n`;
}
