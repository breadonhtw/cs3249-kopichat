import type { Aggregate, SummaryRow, Visibility } from './api/client.ts';

const EXCERPT_MAX = 60;

/** The student's own slip text: the summary's "what" row, cut to 60 characters. */
export function youExcerptOf(rows: SummaryRow[]): string {
  const text = rows.find((r) => r.key === 'what')?.text.trim() ?? '';
  if (text === '') return 'not given';
  return text.length > EXCERPT_MAX ? `${text.slice(0, EXCERPT_MAX - 1).trimEnd()}…` : text;
}

/** The live count's denominator: seed accounts, other real accounts (left out when there are none), and the student. */
export function denominatorLine(aggregate: Pick<Aggregate, 'contributors' | 'seeds'>): string {
  const others = Math.max(0, aggregate.contributors - aggregate.seeds - 1);
  const middle = others === 0 ? '' : ` + ${others} ${others === 1 ? 'other' : 'others'}`;
  return `(${aggregate.seeds} fictional seed accounts${middle} + you)`;
}

/** True when no reviewer has placed the account yet: the theme is "needs review", or classification fell back with no group. */
export function awaitingReview(aggregate: Pick<Aggregate, 'theme' | 'needs_review' | 'group'>): boolean {
  return aggregate.theme === 'needs_review' || (aggregate.group.name === null && aggregate.needs_review === true);
}

function others(count: number): string {
  if (count <= 1) return 'You are the first to report this';
  return `You and ${count - 1} ${count - 1 === 1 ? 'other' : 'others'}`;
}

/** The group lines of "Where your account sits". An account awaiting review claims no group and no count. */
export function placementLines(aggregate: Pick<Aggregate, 'theme' | 'needs_review' | 'group'>): string[] {
  if (awaitingReview(aggregate)) return ['Not grouped yet. A reviewer will place it.'];
  const { name, count } = aggregate.group;
  return [name !== null ? `Group: ${name}` : 'No group yet', others(count)];
}

/** The student's own choice of who sees their words, said back on the receipt. */
export function visibilityLine(visibility: Visibility): string {
  return visibility === 'board'
    ? 'Your slip is on the noticeboard: students who send an account see its first line.'
    : 'Only you and NUSSU see your slip. Other students see the count, not your words.';
}
