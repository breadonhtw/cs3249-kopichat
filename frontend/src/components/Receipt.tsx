import { useEffect, useRef, useState } from 'react';
import type { Aggregate, Consultation, SummaryRow } from '../api/client.ts';
import { consentRows } from '../copy.ts';
import { planBeats, reducedMotion, type BeatName } from '../motion.ts';
import { awaitingReview, denominatorLine, placementLines } from '../receiptLines.ts';
import { themeLabel } from '../themeLabel.ts';
import { Counter } from './Counter.tsx';
import { InlineConfirm } from './InlineConfirm.tsx';
import { Ledger, youExcerptOf } from './Ledger.tsx';
import { rowDisplay } from './SummaryCard.tsx';

type Props = {
  consultation: Consultation;
  account: { id: string; ref_code: string } | null;
  aggregate: Aggregate | null;
  summary: SummaryRow[];
  withdrawn: boolean;
  /** False when the receipt was rebuilt on a reload: it shows its end state at once. */
  replay?: boolean;
  busy: boolean;
  onWithdraw: (onError: (message: string) => void) => Promise<boolean>;
  onContact: (contact: string, onError: (message: string) => void) => Promise<boolean>;
  onDone: () => void;
};

export function Receipt({ consultation, account, aggregate, summary, withdrawn, replay = true, busy, onWithdraw, onContact, onDone }: Props) {
  // Nothing to play when there is no aggregate; reduced motion and a reloaded receipt show the end state at once.
  const [settled, setSettled] = useState(() => aggregate === null || !replay || reducedMotion());
  const [stage, setStage] = useState(0);
  const names = useRef<BeatName[]>([]);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    heading.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (settled || aggregate === null) return;
    const beats = planBeats(aggregate, false);
    names.current = beats.map((b) => b.name);
    const timers = beats.map((b, i) => window.setTimeout(() => setStage(i + 1), b.at));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [settled, aggregate]);

  const reached = (name: BeatName): boolean => settled || names.current.slice(0, stage).includes(name);
  const stamped = settled || stage >= 1;

  const [confirming, setConfirming] = useState(false);
  const [wantsUpdate, setWantsUpdate] = useState(false);
  const [contact, setContact] = useState('');
  // "Contact saved." is written only after the server has taken the contact, and "Contact removed." only after it has
  // let it go. `stored` says the server holds one, so unticking the update box takes it back. Errors sit under the controls.
  const [saved, setSaved] = useState(false);
  const [stored, setStored] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const status = withdrawn ? 'Withdrawn. Your account will not be included.' : saved ? 'Contact saved.' : removed ? 'Contact removed.' : '';

  const youExcerpt = youExcerptOf(summary);
  const count = aggregate?.group.count ?? 1;
  const grouped = aggregate !== null && aggregate.group.name !== null && !awaitingReview(aggregate);
  const playing = !settled && aggregate !== null;
  const counterFrom = aggregate === null ? 0 : Math.max(0, aggregate.contributors - 1);
  const counterTo = aggregate === null ? 0 : aggregate.contributors;
  const counterPlays = playing && reached('writeIn');
  const kept = reached('kept');
  const closed = reached('closing');

  return (
    <div className={settled ? 'receipt receipt--settled' : 'receipt'} onClick={() => setSettled(true)}>
      <p className="muted">Provisional. Not yet reviewed by NUSSU.</p>

      <header className="receipt__head">
        <h1 ref={heading} tabIndex={-1} className={stamped ? 'receipt__stamp is-on' : 'receipt__stamp'}>
          {withdrawn ? 'Withdrawn' : 'Received'}
        </h1>
        {account && <p className="receipt__code">{account.ref_code}</p>}
      </header>

      {summary.length > 0 && (
        <section className="receipt__card" aria-labelledby="receipt-sent">
          <h2 id="receipt-sent">What was sent</h2>
          <ul className="summary__rows">
            {summary.map((row) => {
              const shown = rowDisplay(row);
              return (
                <li key={row.key} className="summary__row">
                  <div className="summary__content">
                    <p className="summary__label">{row.label}</p>
                    <p className={shown.muted ? 'summary__text summary__text--muted' : 'summary__text'}>{shown.text}</p>
                    {shown.note && <p className="summary__note">{shown.note}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {aggregate === null && !withdrawn && (
        <p className="body">Your account is stored. The grouping will appear on the consultation update.</p>
      )}

      {aggregate !== null && !withdrawn && (
        <>
          <section className="receipt__card" aria-labelledby="receipt-sits">
            <h2 id="receipt-sits">Where your account sits</h2>
            <div className="receipt__facts">
              <p className="body">Theme: {themeLabel(aggregate.theme)}</p>
              {placementLines(aggregate).map((line) => (
                <p key={line} className="body">{line}</p>
              ))}
            </div>
            <div className="receipt__count">
              <Counter from={counterFrom} to={reached('writeIn') ? counterTo : counterFrom} play={counterPlays} />
              <p className="muted">{denominatorLine(aggregate)}</p>
            </div>
            <Ledger
              aggregate={aggregate}
              youExcerpt={youExcerpt}
              play={playing}
              reached={{ writeIn: reached('writeIn'), bracket: reached('bracket'), kept }}
            />
            {grouped && count > 1 && (
              <p className="body">
                Across the {count} of you: {aggregate.coverage.how_often.said} said how often.
              </p>
            )}
          </section>

          {aggregate.differing.length > 0 && (
            <section className="receipt__card" aria-labelledby="receipt-differing">
              <h2 id="receipt-differing">Not everyone had the same experience</h2>
              <ul className="receipt__differing">
                {aggregate.differing.map((d) => (
                  <li key={d.id} className="body">
                    {d.excerpt}{' '}
                    <span className={playing && !kept ? 'receipt__note' : 'receipt__note is-on'}>{d.note}</span>
                  </li>
                ))}
              </ul>
              <p className="muted">These stay visible even when only one person said it.</p>
            </section>
          )}
        </>
      )}

      <section className="receipt__card" aria-labelledby="receipt-next">
        <h2 id="receipt-next">What happens next</h2>
        <p className="body">
          Being included here is not a decision. NUSSU reviews the grouping, then may raise it with the office that runs the
          shuttle, ask for more, or explain why it can't act. The update will say what was raised, what changed, and what did
          not.
        </p>

        {!withdrawn && (
          <>
            <label className="check">
              <input
                type="checkbox"
                checked={wantsUpdate}
                disabled={busy}
                onChange={async (e) => {
                  const on = e.target.checked;
                  setWantsUpdate(on);
                  setSaved(false);
                  setRemoved(false);
                  setContactError(null);
                  if (on || !stored) return;
                  // Unticking takes the request back: the stored contact is cleared on the server.
                  if (await onContact('', setContactError)) {
                    setStored(false);
                    setContact('');
                    setRemoved(true);
                  }
                }}
              />
              <span>Send me the update when it's published</span>
            </label>
            {wantsUpdate && (
              <div className="receipt__contact">
                <div className="field">
                  <label className="field__label" htmlFor="receipt-contact">Email or Telegram handle</label>
                  <input
                    id="receipt-contact"
                    className="receipt__input"
                    type="text"
                    autoComplete="off"
                    value={contact}
                    onChange={(e) => {
                      setContact(e.target.value);
                      setSaved(false);
                      setContactError(null);
                    }}
                  />
                </div>
                <button
                  type="button"
                  className="btn"
                  disabled={busy || contact.trim() === ''}
                  onClick={async () => {
                    setSaved(false);
                    setRemoved(false);
                    setContactError(null);
                    const ok = await onContact(contact.trim(), setContactError);
                    setSaved(ok);
                    if (ok) setStored(true);
                  }}
                >
                  Save contact
                </button>
                <p className="muted">Your contact detail is stored apart from your replies and deleted after the final update.</p>
              </div>
            )}
            {contactError && <p className="muted">{contactError}</p>}
          </>
        )}

        {/* Mounted empty and always present, so a screen reader announces what is written into it. */}
        <p className={status === '' ? 'visually-hidden' : 'body'} role="status">{status}</p>

        {withdrawn ? null : confirming && account ? (
          <InlineConfirm
            sentence={`Withdraw ${account.ref_code}? It will not be included.`}
            secondary={{ label: 'Keep', onClick: () => setConfirming(false) }}
            primary={{
              label: 'Withdraw',
              onClick: async () => {
                setWithdrawError(null);
                if (await onWithdraw(setWithdrawError)) heading.current?.focus();
              },
            }}
            busy={busy}
          />
        ) : (
          account && (
            <button
              type="button"
              className="receipt__link"
              onClick={() => {
                setWithdrawError(null);
                setConfirming(true);
              }}
            >
              Withdraw my account
            </button>
          )
        )}
        {withdrawError && !withdrawn && <p className="muted">{withdrawError}</p>}

        <details className="receipt__notice">
          <summary className="receipt__link">Data notice</summary>
          {consentRows(consultation.why).map((row) => (
            <div key={row.title} className="receipt__notice-row">
              <h3>{row.title}</h3>
              <p>{row.body}</p>
            </div>
          ))}
        </details>
      </section>

      {aggregate !== null && !withdrawn && (
        <p className={playing && !closed ? 'receipt__closing' : 'receipt__closing is-on'}>{aggregate.closing_line}</p>
      )}

      <button type="button" className="btn btn--primary" onClick={onDone}>
        Done
      </button>
    </div>
  );
}
