import type { Aggregate, SummaryRow } from '../api/client.ts';
import { awaitingReview } from '../receiptLines.ts';
import { themeLabel } from '../themeLabel.ts';

const EXCERPT_MAX = 60;

export type LedgerRow = { kind: 'group' | 'you' | 'differing'; key: string; first: string; excerpt: string };

/** The student's own row text: the summary's "what" row, cut to 60 characters. */
export function youExcerptOf(rows: SummaryRow[]): string {
  const text = rows.find((r) => r.key === 'what')?.text.trim() ?? '';
  if (text === '') return 'not given';
  return text.length > EXCERPT_MAX ? `${text.slice(0, EXCERPT_MAX - 1).trimEnd()}…` : text;
}

/** Group members, then the student's row, then the differing rows. Column one is the theme, or for a differing row its note. */
export function ledgerRows(aggregate: Aggregate, youExcerpt: string): LedgerRow[] {
  const theme = themeLabel(aggregate.theme);
  return [
    ...aggregate.group.others.map((o): LedgerRow => ({ kind: 'group', key: o.id, first: theme, excerpt: o.excerpt })),
    { kind: 'you', key: 'you', first: theme, excerpt: youExcerpt },
    ...aggregate.differing.map((d): LedgerRow => ({ kind: 'differing', key: d.id, first: d.note, excerpt: d.excerpt })),
  ];
}

/** Which beats have been reached. All true is the end state. */
export type Reached = { writeIn: boolean; bracket: boolean; kept: boolean };

type Props = { aggregate: Aggregate; youExcerpt: string; play: boolean; reached?: Reached };

function Row({ row, reached }: { row: LedgerRow; reached: Reached }) {
  const cls =
    row.kind === 'you'
      ? `ledger__row ledger__row--you${reached.writeIn ? ' is-on' : ''}`
      : row.kind === 'differing'
        ? `ledger__row ledger__row--differing${reached.kept ? ' is-on' : ''}`
        : 'ledger__row';
  return (
    <li className={cls}>
      <span className="ledger__first">{row.first}</span>
      <span className="ledger__excerpt">
        {row.excerpt}
        {row.kind === 'you' && <span className="ledger__pill">you</span>}
        {row.kind === 'differing' && <span className="ledger__kept">kept as a differing experience</span>}
      </span>
    </li>
  );
}

/** A two-column ruled list: theme, excerpt. `play` false shows the end state; otherwise `reached` says how far the sequence is. */
export function Ledger({ aggregate, youExcerpt, play, reached }: Props) {
  const now: Reached = play && reached ? reached : { writeIn: true, bracket: true, kept: true };
  const rows = ledgerRows(aggregate, youExcerpt);
  // An account awaiting review is not shown inside a group, whatever the classifier proposed.
  const grouped = aggregate.group.name !== null && !awaitingReview(aggregate);
  const inGroup = rows.filter((r) => r.kind !== 'differing');
  const differing = rows.filter((r) => r.kind === 'differing');
  const count = aggregate.group.count;
  return (
    <div className="ledger">
      {grouped ? (
        <div className={now.bracket ? 'ledger__group is-on' : 'ledger__group'}>
          <p className="ledger__label">
            <span className="ledger__name">{aggregate.group.name}</span>
            <span className="ledger__count">{count === 1 ? '1 account' : `${count} accounts`}</span>
          </p>
          <ul className="ledger__rows ledger__rows--group">
            {inGroup.map((r) => <Row key={r.key} row={r} reached={now} />)}
          </ul>
        </div>
      ) : (
        <ul className="ledger__rows">
          {inGroup.map((r) => <Row key={r.key} row={r} reached={now} />)}
        </ul>
      )}
      {differing.length > 0 && (
        <ul className="ledger__rows">
          {differing.map((r) => <Row key={r.key} row={r} reached={now} />)}
        </ul>
      )}
    </div>
  );
}
