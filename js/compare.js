// Side-by-side comparison (stage 8). Only items of the same kind can be compared, and positions only when they answer the same
// question (the same concept). When the choice cannot be compared, the result says why in words the page can show.
//
// compareItems(ids, data) returns { ok: true, kind, columns } or { ok: false, reason, detail } where reason is one of
// `too_few`, `unknown_item`, `unlike_kinds`, `unlike_concepts`, `unsupported_kind`.

export const MIN_ITEMS = 2;
export const MAX_ITEMS = 4;
export const COMPARABLE_KINDS = new Set(['position', 'argument']);

export function compareItems(ids, data) {
  const unique = [...new Set(ids)];
  if (unique.length < MIN_ITEMS) return { ok: false, reason: 'too_few', detail: { min: MIN_ITEMS } };
  const found = unique.map((id) => ({ id, ...(data.resolve(id) ?? { kind: null, item: null }) }));
  const missing = found.filter((f) => f.item === null);
  if (missing.length > 0) return { ok: false, reason: 'unknown_item', detail: { ids: missing.map((m) => m.id) } };
  const kinds = [...new Set(found.map((f) => f.kind))];
  if (kinds.length > 1) return { ok: false, reason: 'unlike_kinds', detail: { kinds } };
  const kind = kinds[0];
  if (!COMPARABLE_KINDS.has(kind)) return { ok: false, reason: 'unsupported_kind', detail: { kind } };
  if (kind === 'position') {
    const concepts = [...new Set(found.map((f) => f.item.concept))];
    if (concepts.length > 1) return { ok: false, reason: 'unlike_concepts', detail: { concepts } };
  }
  return { ok: true, kind, columns: found.slice(0, MAX_ITEMS).map((f) => f.item), truncated: found.length > MAX_ITEMS };
}

/** The positions that answer one concept's question, the usual starting point for a comparison. */
export const positionsOn = (data, conceptId) => [...data.positions.values()].filter((p) => p.concept === conceptId);

/** Development links (elaborates, revises, reverses, …) among the compared items, so the comparison can show them with their status. */
export function developmentAmong(ids, data) {
  const set = new Set(ids);
  const types = new Set(['develops', 'elaborates', 'revises', 'reverses', 'republished_as']);
  return data.relationships.filter((r) => types.has(r.type) && set.has(r.from) && set.has(r.to));
}
