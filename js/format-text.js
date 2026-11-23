// Turning record text into safe HTML. Record text carries only light markup: *italic* and paragraph breaks. The text is
// escaped first, the small markup is applied, and the result goes through DOMPurify as a second line of defence.
// Nothing in the app puts un-sanitised text into innerHTML.

import DOMPurify from './vendor/purify.es.mjs';

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escaped text with *italic* turned into <em>. */
export function inlineMarkup(text) {
  return escapeHtml(text).replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
}

const PURIFY_CONFIG = {
  ALLOWED_TAGS: ['em', 'strong', 'p', 'br', 'a', 'ul', 'ol', 'li', 'blockquote'],
  ALLOWED_ATTR: ['href'],
  ALLOW_DATA_ATTR: false,
};

/** Sanitises an HTML string. Only https links survive. */
export function sanitizeHtml(html, purifier = DOMPurify) {
  return purifier.sanitize(html, { ...PURIFY_CONFIG, ALLOWED_URI_REGEXP: /^https:/i });
}

/** Record text as safe paragraphs of HTML. */
export function renderText(text, purifier = DOMPurify) {
  const paragraphs = String(text)
    .split(/\n{2,}/)
    .map((p) => `<p>${inlineMarkup(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  return sanitizeHtml(paragraphs, purifier);
}
