// Timeline logic (stage 8): filtering the events and grouping them by century. Pure functions, no DOM.
//
// An event is { year, to, kind, id, label, status, ... }. `kind` is `publication`, `position`, or a context kind
// (`period`, `event`, `movement`). A range (`to` set) overlaps a filter range when any of its years falls inside it.

export const KIND_GROUPS = {
  publication: ['publication'],
  position: ['position'],
  context: ['period', 'event', 'movement'],
};
export const GROUP_NAMES = Object.keys(KIND_GROUPS);

/** The group (`publication`, `position` or `context`) of an event kind. */
export const groupOf = (kind) => GROUP_NAMES.find((g) => KIND_GROUPS[g].includes(kind)) ?? 'context';

/**
 * Events that pass the filter. `groups` is the set of wanted groups (all when empty); `from` and `to` are years (open when null).
 * A range event passes when its span overlaps the filter span.
 */
export function filterEvents(events, { groups = [], from = null, to = null } = {}) {
  const wanted = new Set(groups.length > 0 ? groups : GROUP_NAMES);
  return events.filter((e) => {
    if (!wanted.has(groupOf(e.kind))) return false;
    const start = e.year;
    const end = e.to ?? e.year;
    if (from !== null && end < from) return false;
    if (to !== null && start > to) return false;
    return true;
  });
}

/** `["4th century", events]` pairs in order, by the century of each event's start year. */
export function groupByCentury(events) {
  const out = new Map();
  for (const e of events) {
    const century = Math.floor((e.year - 1) / 100) + 1;
    if (!out.has(century)) out.set(century, []);
    out.get(century).push(e);
  }
  return [...out].sort(([a], [b]) => a - b).map(([century, list]) => ({ century, events: list }));
}

const SUFFIX = { 1: 'st', 2: 'nd', 3: 'rd' };
/** 21 becomes "21st century". */
export const centuryLabel = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (SUFFIX[n % 10] ?? 'th')} century`;

/** The year text of an event: "1075", or "1075–1122" for a range. */
export const yearText = (e) =>
  e.to !== null && e.to !== undefined && e.to !== e.year ? `${e.year}–${e.to}` : String(e.year);
