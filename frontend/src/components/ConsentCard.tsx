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

/** The consent question, asked outright from the consultation's own name: "Take part in NUSSU’s consultation on …?" */
export function consentQuestion(title: string): string {
  const name = title.trim();
  const lowered = name ? name[0]!.toLowerCase() + name.slice(1) : 'this topic';
  return `Take part in NUSSU’s consultation on ${lowered}?`;
}

/** Why NUSSU is asking, said as a sentence: the consultation's own "To understand …" becomes "NUSSU is asking to understand …". */
export function valueLine(why: string): string {
  const text = why.trim().replace(/\.$/, '');
  if (!text) return 'NUSSU is asking so it can hear what students experience.';
  if (/^to\s/i.test(text)) return `NUSSU is asking ${text[0]!.toLowerCase()}${text.slice(1)}.`;
  return `NUSSU is asking. ${text}.`;
}

/** What declining means, stated plainly: nothing is collected, and the link stays open until the consultation closes. */
export function declineLine(closingDate: string | undefined | null): string {
  const date = closingDate?.trim();
  const until = !date || date.startsWith('[') ? 'any time' : `any time before ${date}`;
  return `If you don’t take part, nothing is collected. You can come back ${until}.`;
}

/** The label of the one control over the rows: it opens whatever is closed, and closes everything only once all are open. */
export function rowsToggleLabel(openCount: number, total: number): 'Expand all' | 'Collapse all' {
  return total > 0 && openCount === total ? 'Collapse all' : 'Expand all';
}

function Chevron() {
  return (
    <svg className="chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.5 6 8 10.5 12.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The consent moment, in the shape the TTC Labs guide calls total consent: the question first, the value, the facts
 * that matter most always visible, the rest one disclosure away, what declining means, and two answers of equal weight.
 * One affirmative button captures consent; there is no second confirmation.
 */
export function ConsentCard({ consultation, busy, onAgree }: Props) {
  const [declined, setDeclined] = useState(false);

  if (declined) {
    return (
      <p className="body" role="status">
        {declinedLine(consultation.closing_date)}
      </p>
    );
  }

  // The card shows "Why" and "Who can see" itself; the remaining rows sit under "More detail".
  const more = consentRows(consultation.why, consultation.closing_date).filter(
    (row) => row.title !== 'Why NUSSU is asking' && row.title !== 'Who can see your responses',
  );

  return (
    <section className="card consent" aria-labelledby="consent-question">
      <h1 id="consent-question" className="consent__question">{consentQuestion(consultation.title)}</h1>
      <p className="body">{valueLine(consultation.why)} About five minutes.</p>

      <h2 className="consent__label">What you should know</h2>
      <ul className="consent__facts">
        <li>Kopichat is an AI and it asks up to 5 short follow-up questions. It may misunderstand you; you can correct it.</li>
        <li>Your replies are read by an AI service and by NUSSU’s consultation team. No name or student ID is collected.</li>
        <li>Nothing goes to NUSSU until you approve the summary.</li>
      </ul>

      <details className="row consent__more">
        <summary className="row__summary">
          <span>More detail</span>
          <Chevron />
        </summary>
        <dl className="consent__detail">
          {more.map((row) => (
            <div key={row.title} className="consent__detail-row">
              <dt>{row.title}</dt>
              <dd>{row.body}</dd>
            </div>
          ))}
        </dl>
      </details>

      <p className="note">{declineLine(consultation.closing_date)}</p>

      <ActionPair
        secondary={{ label: 'Not now', onClick: () => setDeclined(true) }}
        primary={{ label: 'Yes, I’ll take part', onClick: onAgree, disabled: busy }}
      />
    </section>
  );
}
