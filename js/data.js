// The reading data: every pack file the pages need, indexed once, with the lookups the pages use (titles, paths, related items
// grouped by relationship type, chapters, reception, development). It holds public data only (the pack is already rights-filtered).

const DEVELOPMENT_TYPES = new Set(['republished_as', 'develops', 'elaborates', 'revises', 'reverses']);
const RECEPTION_TYPES = new Set(['engages', 'criticises', 'cites', 'draws_upon', 'leads_to', 'related_to']);

const byKey = (list, key) => new Map(list.map((item) => [item[key], item]));

/** How far a status can be trusted, best first: the one kept when several relationships join the same two things. */
const STATUS_RANK = ['confirmed', 'editorially_confirmed', 'explicit', 'editorially_identified', 'suggested'];

/**
 * One entry per thing at the other end. Several relationships can join the same two things (one for each record that mentions a person,
 * for example); the page lists the thing once, with the most trustworthy status among them and how many relationships there were.
 */
export function mergeSameTarget(items) {
  const byTarget = new Map();
  for (const item of items) {
    const kept = byTarget.get(item.otherId);
    if (kept === undefined) {
      byTarget.set(item.otherId, { ...item, count: 1 });
      continue;
    }
    kept.count += 1;
    if (
      STATUS_RANK.indexOf(item.status) !== -1 &&
      STATUS_RANK.indexOf(item.status) < STATUS_RANK.indexOf(kept.status)
    ) {
      kept.status = item.status;
    }
    kept.derived = kept.derived && item.derived;
  }
  return [...byTarget.values()];
}

export function createData(files) {
  const records = byKey(files.records, 'key');
  const sources = byKey(files.sources, 'id');
  const claims = byKey(files.claims, 'id');
  const quotations = byKey(files.quotations, 'id');
  const thinkers = byKey(files.thinkers, 'id');
  const concepts = byKey(files.concepts, 'id');
  const argumentsById = byKey(files.arguments, 'id');
  const positions = byKey(files.positions, 'id');
  const interpretations = byKey(files.interpretations, 'id');
  const pathways = byKey(files.pathways ?? [], 'id');
  const history = byKey(files.history ?? [], 'id');
  const types = files['relationship-types'] ?? {};
  const relationships = files.relationships ?? [];

  const chaptersBySource = new Map();
  for (const record of files.records) {
    if (record.key === record.source) continue;
    if (!chaptersBySource.has(record.source)) chaptersBySource.set(record.source, []);
    chaptersBySource.get(record.source).push(record);
  }
  const claimsByRecord = new Map();
  for (const claim of files.claims) {
    if (!claimsByRecord.has(claim.record)) claimsByRecord.set(claim.record, []);
    claimsByRecord.get(claim.record).push(claim);
  }
  const quotationsByRecord = new Map();
  for (const q of files.quotations) {
    if (!quotationsByRecord.has(q.record)) quotationsByRecord.set(q.record, []);
    quotationsByRecord.get(q.record).push(q);
  }

  /** What an id is: { kind, item }, or null. A claim or quotation id is found before a record key (they contain "#"). */
  function resolve(id) {
    if (sources.has(id)) return { kind: 'source', item: sources.get(id) };
    if (records.has(id)) return { kind: 'record', item: records.get(id) };
    if (claims.has(id)) return { kind: 'claim', item: claims.get(id) };
    if (quotations.has(id)) return { kind: 'quotation', item: quotations.get(id) };
    if (thinkers.has(id)) return { kind: 'thinker', item: thinkers.get(id) };
    if (concepts.has(id)) return { kind: 'concept', item: concepts.get(id) };
    if (argumentsById.has(id)) return { kind: 'argument', item: argumentsById.get(id) };
    if (positions.has(id)) return { kind: 'position', item: positions.get(id) };
    if (interpretations.has(id)) return { kind: 'interpretation', item: interpretations.get(id) };
    if (pathways.has(id)) return { kind: 'pathway', item: pathways.get(id) };
    if (history.has(id)) return { kind: 'history', item: history.get(id) };
    return null;
  }

  const sourceTitle = (id) => sources.get(id)?.citation?.title ?? sources.get(id)?.displayTitle ?? id;

  /** A readable label for any id. */
  function titleOf(id) {
    const found = resolve(id);
    if (found === null) return id;
    const { kind, item } = found;
    switch (kind) {
      case 'source':
        return item.citation?.title ?? item.displayTitle ?? id;
      case 'record':
        return item.title ?? sourceTitle(item.source);
      case 'claim': {
        const record = records.get(item.record);
        return `${record?.title ?? item.record}, claim ${item.number ?? ''}`.trim();
      }
      case 'quotation':
        return `${records.get(item.record)?.title ?? item.record}, quotation`;
      case 'thinker':
        return item.display_name ?? item.name;
      case 'concept':
        return item.name;
      case 'argument':
        return item.title;
      case 'interpretation':
        return item.text.slice(0, 80);
      case 'pathway':
        return item.title;
      case 'position':
        return item.title;
      case 'history':
        return item.name;
      default:
        return id;
    }
  }

  /** The path in the app for an id (without the base), or null when the id has no page. */
  function pathOf(id) {
    const found = resolve(id);
    if (found === null) return null;
    const { kind, item } = found;
    switch (kind) {
      case 'source':
        return `/publication/${encodeURIComponent(id)}`;
      case 'record':
        return `/record/${encodeURIComponent(id)}`;
      case 'claim':
      case 'quotation':
        return `/record/${encodeURIComponent(item.record)}`;
      case 'thinker':
        return `/${item.kind === 'scholar' ? 'scholar' : 'thinker'}/${encodeURIComponent(id)}`;
      case 'concept':
        return `/concept/${encodeURIComponent(id)}`;
      case 'argument':
        return `/argument/${encodeURIComponent(id)}`;
      case 'pathway':
        return `/pathway/${encodeURIComponent(id)}`;
      case 'position':
        return `/position/${encodeURIComponent(id)}`;
      default:
        return null;
    }
  }

  /**
   * Relationships touching any of `ids` (as from, to or subject), each read from the point of view of the page: `reading` is the
   * type, or its reverse when the page is at the `to` end. Grouped by reading, in a stable order.
   */
  function related(ids, { exclude = () => false } = {}) {
    const set = new Set(ids);
    const groups = new Map();
    for (const r of relationships) {
      const atFrom = set.has(r.from);
      const atTo = set.has(r.to);
      if (!atFrom && !atTo) continue;
      const other = atFrom ? r.to : r.from;
      if (set.has(other) || exclude(other)) continue;
      const type = types[r.type] ?? {};
      const reading = atFrom || type.symmetric ? r.type : (type.reverse ?? r.type);
      if (!groups.has(reading)) groups.set(reading, []);
      groups.get(reading).push({
        id: r.id,
        reading,
        otherId: other,
        status: r.status,
        derived: r.derived === true,
        subject: r.subject ?? null,
        basis: r.basis ?? null,
        type: r.type,
      });
    }
    return [...groups]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([reading, items]) => ({
        reading,
        items: mergeSameTarget(items).sort((x, y) => (x.otherId < y.otherId ? -1 : 1)),
      }));
  }

  /** Every id that belongs to a source: the source, its chapters, and their claims and quotations. */
  function idsOfSource(sourceId) {
    const ids = [sourceId];
    for (const chapter of chaptersBySource.get(sourceId) ?? [])
      ids.push(chapter.key, ...(claimsByRecord.get(chapter.key) ?? []).map((c) => c.id));
    ids.push(...(claimsByRecord.get(sourceId) ?? []).map((c) => c.id));
    return ids;
  }

  const sourceOfId = (id) => {
    const found = resolve(id);
    if (found === null) return null;
    if (found.kind === 'source') return found.item.id;
    if (found.kind === 'record') return found.item.source;
    if (found.kind === 'claim' || found.kind === 'quotation') return records.get(found.item.record)?.source ?? null;
    return null;
  };

  return {
    files,
    records,
    sources,
    claims,
    quotations,
    thinkers,
    concepts,
    arguments: argumentsById,
    positions,
    interpretations,
    pathways,
    history,
    hubs: files.hubs ?? {},
    timeline: files.timeline ?? { events: [] },
    relationships,
    relationshipTypes: types,
    site: files.site ?? {},
    thinkersPage: files['thinkers-page'] ?? null,
    shortTitles: files['short-titles'] ?? [],
    corrections: files.corrections ?? [],
    resolve,
    titleOf,
    pathOf,
    related,
    idsOfSource,
    sourceOfId,
    chaptersOf: (sourceId) => chaptersBySource.get(sourceId) ?? [],
    claimsOf: (key) => claimsByRecord.get(key) ?? [],
    quotationsOf: (key) => quotationsByRecord.get(key) ?? [],
    correctionsFor: (ids) => files.corrections?.filter((c) => ids.includes(c.id)) ?? [],
    /** Reception: other sources' relationships to this source's items that read as engagement. */
    reception(sourceId) {
      const own = this.idsOfSource(sourceId);
      return related(own, { exclude: (other) => sourceOfId(other) === sourceId }).filter(
        (g) => RECEPTION_TYPES.has(g.reading) || g.items.some((i) => RECEPTION_TYPES.has(i.type)),
      );
    },
    /** Development: republication and revision links of this source's items. */
    development(sourceId) {
      return related(this.idsOfSource(sourceId), { exclude: (other) => sourceOfId(other) === sourceId }).filter((g) =>
        g.items.some((i) => DEVELOPMENT_TYPES.has(i.type)),
      );
    },
    /** Authored items (arguments, concepts, positions) that rest on any item of the source. */
    contentFor(sourceId) {
      const own = new Set(this.idsOfSource(sourceId));
      const touches = (list) => list.some((id) => typeof id === 'string' && own.has(id));
      return {
        arguments: [...argumentsById.values()].filter((a) =>
          touches([...a.source, a.central_proposition, ...(a.premises ?? []), ...(a.conclusions ?? [])]),
        ),
        concepts: [...concepts.values()].filter((c) => touches(c.evidence ?? [])),
        positions: [...positions.values()].filter((p) => touches(p.supported_by ?? []) || false),
      };
    },
    interpretationsOf: (id) =>
      [...interpretations.values()].filter((i) => i.target?.id === id || i.locator?.claim === id),
    /** Records and sources written by a person. */
    worksBy(personId) {
      const written = [...records.values()].filter((r) => r.authors?.ids?.includes(personId));
      const bySource = new Map();
      for (const r of written) {
        if (!bySource.has(r.source)) bySource.set(r.source, []);
        bySource.get(r.source).push(r);
      }
      return bySource;
    },
  };
}
