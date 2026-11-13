import { useState } from 'react';
import type { Consultation } from '../api/client.ts';
import { consentRows, INVITATION, type Channel } from '../copy.ts';
import { ActionPair } from './ActionPair.tsx';

type Props = { consultation: Consultation; busy: boolean; onAgree: () => void; channel?: Channel };

/** The three facts that differ between the chat and the form, because the same sentence would be untrue of one of them. */
export function channelFacts(channel: Channel): { questions: string; readers: string; sent: string } {
  if (channel === 'form') {
    return {
      questions: '5 written questions on one page. You can leave any of them empty.',
      readers: 'NUSSU’s consultation team. No name or student ID is collected.',
      sent: 'Only when you press Submit on the review page. Nothing before that.',
    };
  }
  return {
    questions: 'Up to 5 short follow-ups, usually fewer. Kopichat is an AI: it may misunderstand you, and you can correct it.',
    readers: 'NUSSU’s consultation team and an AI service. Other students only if you choose so before sending. No name or student ID is collected.',
    sent: 'Only when you approve the summary. Nothing before that.',
  };
}

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
 * that matter most set as a printed notice, the rest one disclosure away, what declining means, and two answers of
 * equal weight. One affirmative button captures consent; there is no second confirmation. On a phone it stacks in that
 * order; at laptop width the notice stands beside the question and the answers align with its foot.
 */
export function ConsentCard({ consultation, busy, onAgree, channel = 'chat' }: Props) {
  const facts = channelFacts(channel);
  const [declined, setDeclined] = useState(false);

  if (declined) {
    return (
      <p className="body" role="status">
        {declinedLine(consultation.closing_date)}
      </p>
    );
  }

  // The notice carries how findings are used and stopping; the other rows are on the notice's own lines.
  const more = consentRows(consultation.why, consultation.closing_date, channel).filter(
    (row) => row.title !== 'Why NUSSU is asking' && row.title !== 'Who can see your responses',
  );
  const closing = consultation.closing_date?.trim();
  const closes = closing && !closing.startsWith('[') ? closing : null;

  return (
    <section className="card consent" aria-labelledby="consent-question">
      <div className="consent__side">
      <div className="consent__head">
        <h1 id="consent-question" className="consent__question">{consentQuestion(consultation.title)}</h1>
        <p className="body">{valueLine(consultation.why)}</p>
        <p className="body">{INVITATION}</p>
      </div>

      <div className="consent__answer">
        <p className="note">{declineLine(consultation.closing_date)}</p>
        <ActionPair
          secondary={{ label: 'Not now', onClick: () => setDeclined(true) }}
          primary={{ label: 'Yes, I’ll take part', onClick: onAgree, disabled: busy }}
        />
      </div>
      </div>
      <aside className="consent__notice" aria-label="The consultation">
        <h2 className="consent__label">The consultation</h2>
        <dl className="facts">
          <div className="facts__row"><dt>Topic</dt><dd>{consultation.title}</dd></div>
          <div className="facts__row"><dt>Asked by</dt><dd>NUSSU</dd></div>
          {closes && <div className="facts__row"><dt>Closes</dt><dd>{closes}</dd></div>}
          <div className="facts__row"><dt>Takes</dt><dd>5 min</dd></div>
          <div className="facts__row"><dt>Questions</dt><dd>{facts.questions}</dd></div>
          <div className="facts__row"><dt>Who reads it</dt><dd>{facts.readers}</dd></div>
          <div className="facts__row"><dt>Sent</dt><dd>{facts.sent}</dd></div>
        </dl>
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
      </aside>

    </section>
  );
}
