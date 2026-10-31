import type { ReviewGroup, StripSection } from './api/client.ts';

/** The count beside a caption: how many of the group said something here, or how many accounts outside it are kept. */
export function countLine(count: StripSection['count']): string {
  if (count.of !== null) return `${count.said} of ${count.of} said`;
  if (count.said === 0) return 'None outside this group';
  return count.said === 1 ? '1 account kept visible' : `${count.said} accounts kept visible`;
}

/** The line under every illustration. It is drawn from what the accounts describe; it shows no single event. */
export function drawnLine(accounts: number): string {
  const what = accounts === 1 ? '1 account describes' : `${accounts} accounts describe`;
  return `Illustration of what ${what}, not a photograph of one event.`;
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

/** Where the demo's jump goes: the reviewer page, opened on the student's group with their account marked. */
export function reviewHref(ref: string): string {
  return `/review?ref=${encodeURIComponent(ref)}`;
}

/** The presenter's key for the jump: a plain press of `n` (any case), not held and not part of a shortcut. */
export function isReviewKey(e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; repeat?: boolean }): boolean {
  return e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat;
}
