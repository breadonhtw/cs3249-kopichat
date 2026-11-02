import { useState } from 'react';
import type { Consultation } from '../api/client.ts';
import { consentRows } from '../copy.ts';
import { ActionPair } from './ActionPair.tsx';

type Props = { consultation: Consultation; busy: boolean; onAgree: () => void };

/** The line shown after "Not now". A missing or placeholder closing date ("[...]") is left out. */
export function declinedLine(closingDate: string | undefined | null): string {
  const date = closingDate?.trim();
  if (!date || date.startsWith('[')) return 'No problem. You can open this link again any time.';
  return `No problem. You can open this link again any time before ${date}.`;
}

function Chevron() {
  return (
    <svg className="chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.5 6 8 10.5 12.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The label of the one control over the rows: it opens whatever is closed, and closes everything only once all are open. */
export function rowsToggleLabel(openCount: number, total: number): 'Expand all' | 'Collapse all' {
  return total > 0 && openCount === total ? 'Collapse all' : 'Expand all';
}

function Row({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: (open: boolean) => void; children: string }) {
  return (
    <details className="row" open={open} onToggle={(e) => onToggle((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="row__summary">
        <span>{title}</span>
        <Chevron />
      </summary>
      <p className="row__body">{children}</p>
    </details>
  );
}

export function ConsentCard({ consultation, busy, onAgree }: Props) {
  const [agreed, setAgreed] = useState(false);
  const [declined, setDeclined] = useState(false);
  const rows = consentRows(consultation.why);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggleLabel = rowsToggleLabel(open.size, rows.length);
  const setRow = (title: string, isOpen: boolean) =>
    setOpen((prev) => {
      if (prev.has(title) === isOpen) return prev;
      const next = new Set(prev);
      if (isOpen) next.add(title); else next.delete(title);
      return next;
    });
  const toggleAll = () => setOpen(toggleLabel === 'Expand all' ? new Set(rows.map((r) => r.title)) : new Set());

  if (declined) {
    return (
      <p className="body" role="status">
        {declinedLine(consultation.closing_date)}
      </p>
    );
  }

  return (
    <section className="card" aria-label="Before you start">
      <p className="body">
        Kopichat is an AI. It asks up to 5 short follow-up questions, usually fewer, and stops once it has enough. It may
        misunderstand you; you can correct it.
      </p>
      <p className="body">
        Your replies are read by an AI service and by NUSSU's consultation team. Nothing goes to NUSSU until you approve the
        summary.
      </p>
      <div className="rows">
        <div className="rows__bar">
          <button type="button" className="rows__toggle" onClick={toggleAll}>
            {toggleLabel}
          </button>
        </div>
        {rows.map((row) => (
          <Row key={row.title} title={row.title} open={open.has(row.title)} onToggle={(isOpen) => setRow(row.title, isOpen)}>
            {row.body}
          </Row>
        ))}
      </div>
      <label className="check">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>I understand how my replies will be used and agree to take part.</span>
      </label>
      <ActionPair
        secondary={{ label: 'Not now', onClick: () => setDeclined(true) }}
        primary={{ label: 'Agree and start', onClick: onAgree, disabled: !agreed || busy }}
      />
    </section>
  );
}
