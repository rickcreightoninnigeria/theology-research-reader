// Generated covers: a small quiet "cover" for a source that has no real one, so every row and page has the same shape. It is drawn from the
// record's own data only (type, journal, title, author), as inline SVG built with DOM calls (no HTML from data), and shown by the desktop
// stylesheet only. One journal gets one look: every article from it shares a colour and masthead, whatever its year or issue.

const SVG = 'http://www.w3.org/2000/svg';

/** A small stable number for a string (FNV-1a), so a journal always gets the same colour. */
export function hashOf(text) {
  let h = 0x811c9dc5;
  for (const ch of String(text).normalize('NFKC').toLowerCase()) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

// Muted hues that sit well with the page's cream and ink: blues, greens, plum, rust, ochre, slate.
const HUES = [212, 168, 148, 28, 12, 340, 292, 245, 44, 190];

/** Greedy word wrap for a heading on a narrow tile. Long words are cut; too many lines end in an ellipsis. */
export function wrapLines(text, maxChars = 13, maxLines = 5) {
  const words = String(text ?? '')
    .replace(/\*/g, '')
    .split(/\s+/)
    .filter(Boolean);
  const lines = [];
  let line = '';
  for (let word of words) {
    if (word.length > maxChars) word = `${word.slice(0, maxChars - 1)}…`;
    if (line === '') line = word;
    else if (`${line} ${word}`.length <= maxChars) line = `${line} ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line !== '') lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].replace(/…$/, '')}…`;
    return kept;
  }
  return lines;
}

const surname = (creator) => {
  const name = String(creator?.display_name ?? creator?.name ?? '').trim();
  return name === '' ? '' : (name.split(/\s+/).at(-1) ?? '');
};

/**
 * What to draw for a source: { kind, hue, heading, lines, label }. `kind` is journal, thesis, web or book. `label` is a translation key for a
 * small caption (or null). Pure, so it can be tested without a browser.
 */
export function coverModel(source) {
  const citation = source?.citation ?? {};
  const type = citation.type ?? 'book';
  const journal = citation.container?.title ?? null;
  const title = citation.title ?? source?.displayTitle ?? source?.id ?? '';
  if ((type === 'article' || type === 'review') && journal) {
    return {
      kind: 'journal',
      type,
      hue: HUES[hashOf(journal.replace(/^the\s+/i, '')) % HUES.length],
      lines: wrapLines(journal.replace(/:.*$/, ''), 12, 5),
      label: type === 'review' ? 'cover_review' : null,
    };
  }
  if (type === 'thesis') {
    return { kind: 'thesis', hue: 222, lines: wrapLines(title, 14, 5), label: 'cover_thesis' };
  }
  if (type === 'web_page') {
    return { kind: 'web', hue: HUES[hashOf(title) % HUES.length], lines: wrapLines(title, 14, 3), label: 'cover_web' };
  }
  const who = surname((citation.creators ?? [])[0]);
  return {
    kind: 'book',
    hue: HUES[hashOf(who || title) % HUES.length],
    lines: wrapLines(title, 13, 5),
    author: who,
    label: null,
  };
}

const node = (doc, name, attrs = {}, text = null) => {
  const n = doc.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (text !== null) n.textContent = text;
  return n;
};

/** The cover as an SVG element (2:3, like a book), decorative only. `t` gives the small captions. */
export function drawCover(doc, model, t, className = 'cover-gen') {
  const dark = `hsl(${model.hue} 28% 30%)`;
  const mid = `hsl(${model.hue} 24% 44%)`;
  const light = `hsl(${model.hue} 30% 84%)`;
  const ink = '#f6f1e6';
  const svg = node(doc, 'svg', { viewBox: '0 0 100 150', class: className, 'aria-hidden': 'true', focusable: 'false' });
  const longest = Math.max(1, ...model.lines.map((l) => l.length));
  const size = Math.max(7, Math.min(12, 84 / (longest * 0.56)));
  const heading = (y0) =>
    model.lines.map((line, i) =>
      node(
        doc,
        'text',
        {
          x: 50,
          y: y0 + i * (size * 1.25),
          'text-anchor': 'middle',
          'font-family': 'Georgia, "Times New Roman", serif',
          'font-size': size.toFixed(1),
          'font-weight': model.kind === 'journal' ? 700 : 400,
          fill: model.kind === 'journal' ? ink : model.kind === 'thesis' ? ink : dark,
        },
        line,
      ),
    );
  if (model.kind === 'journal') {
    svg.append(node(doc, 'rect', { width: 100, height: 150, rx: 2, fill: dark }));
    svg.append(
      node(doc, 'rect', {
        x: 5,
        y: 5,
        width: 90,
        height: 140,
        fill: 'none',
        stroke: light,
        'stroke-width': 0.7,
        opacity: 0.55,
      }),
    );
    svg.append(...heading(30 - (model.lines.length - 1) * size * 0.45));
    svg.append(node(doc, 'line', { x1: 18, x2: 82, y1: 66, y2: 66, stroke: light, 'stroke-width': 0.7, opacity: 0.7 }));
    if (model.type === 'review') {
      svg.append(
        node(
          doc,
          'text',
          {
            x: 50,
            y: 124,
            'text-anchor': 'middle',
            'font-family': 'Georgia, serif',
            'font-size': 60,
            fill: light,
            opacity: 0.22,
          },
          '“',
        ),
      );
    } else {
      for (let i = 0; i < 7; i += 1) {
        svg.append(
          node(doc, 'line', {
            x1: 18,
            x2: i % 3 === 2 ? 60 : 82,
            y1: 82 + i * 8,
            y2: 82 + i * 8,
            stroke: light,
            'stroke-width': 1.2,
            opacity: 0.28,
          }),
        );
      }
    }
  } else if (model.kind === 'thesis') {
    svg.append(node(doc, 'rect', { width: 100, height: 150, rx: 2, fill: dark }));
    svg.append(
      node(doc, 'rect', {
        x: 6,
        y: 6,
        width: 88,
        height: 138,
        fill: 'none',
        stroke: light,
        'stroke-width': 0.8,
        opacity: 0.5,
      }),
    );
    svg.append(
      node(doc, 'rect', {
        x: 9,
        y: 9,
        width: 82,
        height: 132,
        fill: 'none',
        stroke: light,
        'stroke-width': 0.4,
        opacity: 0.4,
      }),
    );
    svg.append(...heading(40));
    svg.append(node(doc, 'rect', { x: 9, y: 116, width: 82, height: 13, fill: mid, opacity: 0.8 }));
    svg.append(
      node(
        doc,
        'text',
        {
          x: 50,
          y: 125.3,
          'text-anchor': 'middle',
          'font-family': 'Georgia, serif',
          'font-size': 7,
          'letter-spacing': 1.4,
          fill: ink,
        },
        t(model.label).toUpperCase(),
      ),
    );
  } else if (model.kind === 'web') {
    svg.append(node(doc, 'rect', { width: 100, height: 150, rx: 2, fill: light }));
    svg.append(
      node(doc, 'rect', { x: 8, y: 14, width: 84, height: 70, rx: 2, fill: 'none', stroke: dark, 'stroke-width': 1.2 }),
    );
    svg.append(node(doc, 'line', { x1: 8, x2: 92, y1: 25, y2: 25, stroke: dark, 'stroke-width': 1 }));
    for (const x of [14, 20, 26]) svg.append(node(doc, 'circle', { cx: x, cy: 19.5, r: 1.6, fill: dark }));
    svg.append(...heading(102));
    svg.append(
      node(
        doc,
        'text',
        {
          x: 50,
          y: 143,
          'text-anchor': 'middle',
          'font-family': 'Georgia, serif',
          'font-size': 6,
          'letter-spacing': 1.2,
          fill: mid,
        },
        t(model.label).toUpperCase(),
      ),
    );
  } else {
    svg.append(node(doc, 'rect', { width: 100, height: 150, rx: 2, fill: light }));
    svg.append(node(doc, 'rect', { width: 9, height: 150, fill: dark }));
    svg.append(
      node(doc, 'rect', {
        x: 16,
        y: 6,
        width: 78,
        height: 138,
        fill: 'none',
        stroke: dark,
        'stroke-width': 0.6,
        opacity: 0.5,
      }),
    );
    svg.append(...heading(46 - (model.lines.length - 1) * size * 0.4));
    if (model.author) {
      svg.append(
        node(doc, 'line', { x1: 30, x2: 80, y1: 118, y2: 118, stroke: dark, 'stroke-width': 0.6, opacity: 0.6 }),
      );
      svg.append(
        node(
          doc,
          'text',
          {
            x: 55,
            y: 131,
            'text-anchor': 'middle',
            'font-family': 'Georgia, serif',
            'font-size': 7.5,
            'letter-spacing': 0.8,
            fill: dark,
          },
          model.author.toUpperCase().slice(0, 14),
        ),
      );
    }
  }
  return svg;
}
