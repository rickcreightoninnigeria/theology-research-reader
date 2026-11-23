// The "Ask an AI" block on a page: choose a purpose, keep or drop the guardrail preamble, edit the prompt, copy it.
// The text area IS the prompt: what the reader copies is exactly what is in it, so removing the preamble there removes it from the copy.

import { PURPOSES, buildPrompt, describeTarget } from './ask-ai.js';
import { el } from './ui.js';

export function askAiBlock(ctx, { id }) {
  const { doc, t } = ctx;
  const target = describeTarget(ctx, id);
  if (target === null) return null;
  const box = el(doc, 'details', { class: 'ask-ai', id: 'ask-ai' }, el(doc, 'summary', { text: t('ask_button') }));
  box.append(el(doc, 'p', { class: 'hint', text: t('ask_intro') }));

  const select = el(doc, 'select', { id: 'ask-purpose', 'aria-label': t('ask_purpose_label') });
  for (const purpose of PURPOSES)
    select.append(el(doc, 'option', { value: purpose, text: t(`ask_purpose_${purpose}`) }));
  const preambleBox = el(doc, 'input', { type: 'checkbox', id: 'ask-preamble' });
  preambleBox.checked = true;
  const area = el(doc, 'textarea', { id: 'ask-text', rows: '14', 'aria-label': t('ask_text_label') });

  const regenerate = () => {
    area.value = buildPrompt({
      t,
      purpose: select.value,
      target,
      preamble: preambleBox.checked ? t('ask_preamble') : null,
    });
  };
  select.addEventListener('change', regenerate);
  preambleBox.addEventListener('change', regenerate);
  regenerate();

  const status = el(doc, 'span', { class: 'copied', role: 'status' });
  const copy = el(doc, 'button', { type: 'button', id: 'ask-copy', text: t('ask_copy') });
  copy.addEventListener('click', async () => {
    try {
      await globalThis.navigator.clipboard.writeText(area.value);
      status.textContent = ` ${t('diag_copied')}`;
    } catch {
      status.textContent = ` ${t('copy_failed')}`;
    }
  });
  box.append(
    el(doc, 'label', { for: 'ask-purpose', text: t('ask_purpose_label') }),
    select,
    el(
      doc,
      'p',
      {},
      preambleBox,
      ' ',
      el(doc, 'label', { for: 'ask-preamble', class: 'inline', text: t('ask_preamble_label') }),
    ),
    el(doc, 'p', { class: 'hint', text: t('ask_reset_note') }),
    el(doc, 'label', { for: 'ask-text', text: t('ask_text_label') }),
    area,
    el(doc, 'p', {}, copy, status),
  );
  return box;
}
