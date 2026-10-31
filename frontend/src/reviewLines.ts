import type { ReviewGroup, Strip, StripLine, StripSection } from './api/client.ts';

/** The count beside a caption: how many of the group said something here, or how many accounts outside it are kept. */
export function countLine(count: StripSection['count']): string {
  if (count.of !== null) return `${count.said} of ${count.of} said`;
  if (count.said === 0) return 'None outside this group';
  return count.said === 1 ? '1 account kept visible' : `${count.said} accounts kept visible`;
}

/** The line under every illustration: how many accounts it is drawn from. The page head already says pictures only illustrate. */
export function drawnLine(accounts: number): string {
  return accounts === 1 ? 'Drawn from 1 account.' : `Drawn from ${accounts} accounts.`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DATE_TAG = /\s*\[(\d{4})-(\d{2})(?:-(\d{2}))?\]/g;

/**
 * A stored quote split into the student's words and the dates the app worked out and appended in brackets
 * ("yesterday [2026-10-30]"). The brackets are not the student's words, so they leave the quotation marks.
 */
export function splitQuote(text: string): { words: string; dates: string[] } {
  const dates: string[] = [];
  const words = text.replace(DATE_TAG, (_, y: string, m: string, d?: string) => {
    const month = MONTHS[Number(m) - 1];
    if (month) dates.push(d ? `${Number(d)} ${month} ${y}` : `${month} ${y}`);
    return '';
  }).trim();
  return { words, dates: [...new Set(dates)] };
}

/** For each line that repeats an earlier line's words exactly, who said them first. */
export function repeatsOf(said: StripLine[]): Map<string, string> {
  const first = new Map<string, string>();
  const repeats = new Map<string, string>();
  for (const line of said) {
    if (!line.quote) continue;
    const key = splitQuote(line.quote).words.toLowerCase();
    const earlier = first.get(key);
    if (earlier) repeats.set(line.who, earlier);
    else first.set(key, line.who);
  }
  return repeats;
}

/** One line for a section nobody in the group spoke to, naming who skipped it and who never said it. */
export function silentLine(said: StripLine[]): string {
  const skipped = said.filter((l) => l.note === 'skipped').map((l) => l.who);
  const unsaid = said.filter((l) => l.note !== 'skipped').map((l) => l.who);
  return [unsaid.length ? `Not said by ${unsaid.join(', ')}.` : '', skipped.length ? `Skipped by ${skipped.join(', ')}.` : '']
    .filter(Boolean).join(' ');
}

// Short names for the head's tally, where a panel holds more than one section.
const SECTION_NAMES: Record<string, string[]> = { read: ['Their read on the cause', 'What would help'] };

/** The strip head's tally: one row per section, so the first screen says which parts of the account the group gave. */
export function tallyRows(strip: Strip): { id: string; label: string; figure: string }[] {
  return strip.panels.flatMap((panel) =>
    panel.sections.map((section, i) => ({
      id: `panel-${panel.key}`,
      label: SECTION_NAMES[panel.key]?.[i] ?? panel.title,
      figure: section.count.of !== null
        ? `${section.count.said} of ${section.count.of}`
        : section.count.said === 1 ? '1 account' : `${section.count.said} accounts`,
    })));
}

export function groupFacts(group: { count: number; pending: boolean; id: string }): string {
  const n = group.count === 1 ? '1 account' : `${group.count} accounts`;
  if (group.id === 'ungrouped') return `${n} no group holds yet. A reviewer places them.`;
  if (group.pending) return `${n}. Name proposed by the model; no reviewer has named this group yet.`;
  return `${n}. Provisional grouping.`;
}

/** The group the page opens on: the first with illustrations, else the first in the list. */
export function pickGroup(groups: ReviewGroup[]): string | null {
  return (groups.find((g) => g.has_art) ?? groups[0])?.id ?? null;
}

const REF = /^KR-\d{4}$/;

/** The KR reference the reviewer page was opened on (?ref=KR-1234), or null. Anything else in the address is ignored. */
export function refFromSearch(search: string): string | null {
  const ref = new URLSearchParams(search).get('ref');
  return ref !== null && REF.test(ref) ? ref : null;
}

/** The group chosen last (?group=), when it is still one of the listed groups. */
export function groupFromSearch(search: string, ids: string[]): string | null {
  const id = new URLSearchParams(search).get('group');
  return id !== null && ids.includes(id) ? id : null;
}

/** The address search after choosing a group: ?group= set, anything else (the demo's ?ref) kept. */
export function searchWithGroup(search: string, id: string): string {
  const params = new URLSearchParams(search);
  params.set('group', id);
  return `?${params.toString()}`;
}

/** Where the demo's jump goes: the reviewer page, opened on the student's group with their account marked. */
export function reviewHref(ref: string): string {
  return `/review?ref=${encodeURIComponent(ref)}`;
}

/** The presenter's key for the jump: a plain press of `n` (any case), not held and not part of a shortcut. */
export function isReviewKey(e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; repeat?: boolean }): boolean {
  return e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat;
}
