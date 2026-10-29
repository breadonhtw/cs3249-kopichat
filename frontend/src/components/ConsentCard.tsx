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

function Row({ title, children }: { title: string; children: string }) {
  return (
    <details className="row">
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
        {consentRows(consultation.why).map((row) => (
          <Row key={row.title} title={row.title}>
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
