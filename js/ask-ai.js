// "Ask an AI" prompts (D26): a prompt the reader copies into an external chatbot. Nothing is sent from this app and it works offline.
// A prompt is: the guardrail preamble (on by default, and the reader can edit or remove it), a purpose template, then the excerpt with
// its record key and verification status, so any answer can be traced back. All wording comes from the locale files.

export const PURPOSES = ['beginner', 'history', 'comparison', 'critique', 'assessment', 'reading', 'essays'];
export const EXCERPT_LIMIT = 2500;

const clip = (text, limit = EXCERPT_LIMIT) =>
  text.length <= limit ? text : `${text.slice(0, limit).replace(/\s+\S*$/, '')} […]`;
const plain = (text) => String(text).replace(/\*/g, '').replace(/\s+/g, ' ').trim();

/**
 * What the prompt is about: the title, the key, a status line and the excerpt. For a record the excerpt is its summary and main
 * claims as they are shown publicly; a listed-only record has no summary, and the excerpt says so rather than inventing one.
 */
export function describeTarget(ctx, id) {
  const { t, data } = ctx;
  const found = data.resolve(id);
  if (found === null) return null;
  const { kind, item } = found;
  if (kind === 'record' || kind === 'source') {
    const record = kind === 'record' ? item : data.records.get(id);
    const title = data.titleOf(id);
    const fields = record?.fields ?? [];
    const summary = fields.find((f) =>
      ['Summary', 'Purpose and overall argument', 'Author’s purpose and overall argument'].includes(f.name),
    )?.value;
    const claims = data.claimsOf(record?.key ?? id).map((c, i) => `${i + 1}. ${plain(c.text)}`);
    const parts = [
      summary ? plain(summary) : null,
      claims.length ? `${t('ask_claims_heading')}\n${claims.join('\n')}` : null,
    ].filter(Boolean);
    const verification = record?.verification;
    return {
      title,
      key: id,
      status: verification
        ? `${t(`badge_verification_${verification.quotations}`)}; ${t(`badge_pages_${verification.pages}`)}`
        : t('ask_status_unknown'),
      excerpt: parts.length > 0 ? clip(parts.join('\n\n')) : t('ask_no_excerpt'),
    };
  }
  if (kind === 'argument') {
    return {
      title: item.title,
      key: id,
      status: t(`badge_status_${item.status}`),
      excerpt: clip(
        `${plain(data.claims.get(item.central_proposition)?.text ?? '')}\n\n${plain(item.reasoning)}`.trim(),
      ),
    };
  }
  if (kind === 'concept')
    return {
      title: item.name,
      key: id,
      status: t(`badge_status_${item.status}`),
      excerpt: clip([item.definition, item.in_subject ?? item.in_odonovan].filter(Boolean).map(plain).join('\n\n')),
    };
  if (kind === 'position')
    return { title: item.title, key: id, status: t(`badge_status_${item.status}`), excerpt: clip(plain(item.summary)) };
  return { title: data.titleOf(id), key: id, status: t('ask_status_unknown'), excerpt: t('ask_no_excerpt') };
}

/** The whole prompt as text. `preamble` is the guardrail text (or null to leave it out). */
export function buildPrompt({ t, purpose, target, preamble }) {
  const out = [];
  if (preamble !== null && preamble !== undefined && preamble.trim() !== '') out.push(preamble.trim(), '');
  out.push(t(`ask_purpose_${purpose}_prompt`), '');
  out.push(
    `${t('ask_label_title')}: ${target.title}`,
    `${t('ask_label_key')}: ${target.key}`,
    `${t('ask_label_status')}: ${target.status}`,
    '',
    t('ask_label_excerpt'),
    target.excerpt,
  );
  return out.join('\n');
}
