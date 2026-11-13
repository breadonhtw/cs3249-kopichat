import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, createFormClient, type Consultation, type FormField, type FormSent } from '../api/client.ts';
import { closedLine } from '../closedLine.ts';
import { consentRows } from '../copy.ts';
import { draftKey, EMPTY_DRAFT, hasAnswer, parseDraft, reviewRows, toSubmission, withReviewEdit, type FormDraft } from '../formDraft.ts';
import { ActionPair } from './ActionPair.tsx';
import { ConsentCard } from './ConsentCard.tsx';
import { InlineConfirm } from './InlineConfirm.tsx';
import { NoticeStrip } from './NoticeStrip.tsx';
import { OverallQuestion } from './OverallQuestion.tsx';
import { rowDisplay } from './SummaryCard.tsx';
import { SummaryRowEdit } from './SummaryRowEdit.tsx';

type Loaded = { consultation: Consultation; fields: FormField[] };
type End = 'deleted' | 'done' | null;

function messageOf(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return 'Could not reach the server. Check your connection and try again.';
}

function readDraft(key: string): FormDraft {
  try {
    return parseDraft(globalThis.sessionStorage?.getItem(key));
  } catch {
    return EMPTY_DRAFT;
  }
}

/**
 * The matched form, at /form: the user study's comparison condition. The same consultation, notice, overall question
 * and five schema questions as the chat, as fixed fields in a fixed order, with no follow-ups and no model. The
 * answers stay in this tab until Submit on the review page; the server knows only when the link was opened.
 */
export function FormApp() {
  const client = useMemo(() => createFormClient(), []);
  const key = draftKey(client.sessionId);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [sent, setSent] = useState<FormSent | null>(null);
  const [draft, setDraft] = useState<FormDraft>(() => readDraft(key));
  const [end, setEnd] = useState<End>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const top = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    client
      .open()
      .then((info) => {
        if (!live) return;
        setError(null);
        setLoaded({ consultation: info.consultation, fields: info.fields });
        setSent(info.submission ?? null);
      })
      .catch((e) => live && setError(messageOf(e)));
    return () => {
      live = false;
    };
  }, [client, attempt]);

  // The draft survives a reload of this tab, so a slip of the thumb does not cost the student their answers.
  useEffect(() => {
    try {
      globalThis.sessionStorage?.setItem(key, JSON.stringify(draft));
    } catch {
      // storage blocked: the draft lives in memory only
    }
  }, [key, draft]);

  const stage = sent !== null ? 'receipt' : end ?? draft.stage;
  useEffect(() => {
    window.scrollTo(0, 0);
    top.current?.focus({ preventScroll: true });
  }, [stage]);

  useEffect(() => {
    if (loaded) document.title = `NUSSU consultation: ${loaded.consultation.title}`;
  }, [loaded]);

  const go = (next: FormDraft['stage']) => {
    setError(null);
    setEditing(null);
    setStopping(false);
    setDraft((d) => ({ ...d, stage: next }));
  };

  const step = stage === 'overall' ? 1 : stage === 'fields' ? 2 : stage === 'review' || stage === 'receipt' ? 3 : undefined;
  const consultation = loaded?.consultation ?? null;
  const fields = loaded?.fields ?? [];
  const ready = hasAnswer(draft, fields);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      setSent(await client.submit(toSubmission(draft, fields)));
      setDraft(EMPTY_DRAFT);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    setBusy(true);
    setError(null);
    try {
      await client.withdraw();
      setSent((s) => (s === null ? s : { ...s, withdrawn: true }));
      setWithdrawing(false);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const stop = (
    <InlineConfirm
      sentence="Nothing has been sent. Delete what you typed?"
      secondary={{ label: 'Keep', onClick: () => setStopping(false) }}
      primary={{
        label: 'Delete',
        onClick: () => {
          setDraft(EMPTY_DRAFT);
          setStopping(false);
          setEnd('deleted');
        },
      }}
      busy={busy}
    />
  );

  return (
    <div className="layout">
      <div className="phone">
        <div className="shell" ref={top} tabIndex={-1} style={{ outline: 'none' }}>
          <NoticeStrip
            line1={step !== undefined && consultation !== null ? consultation.title : 'NUSSU consultation'}
            line2={step !== undefined ? `Step ${step} of 3` : 'Written form'}
            step={step}
            fictional
          />
          <main className="main">
            {consultation === null ? (
              error ? (
                <>
                  <p className="muted" role="alert">{error}</p>
                  <button type="button" className="btn btn--retry" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
                </>
              ) : (
                <p className="muted">Opening the consultation.</p>
              )
            ) : stage === 'receipt' && sent !== null ? (
              <div className="receipt receipt--settled">
                <header className="receipt__head">
                  <h1 className="receipt__stamp is-on">{sent.withdrawn ? 'Withdrawn' : 'Received'}</h1>
                  <p className="receipt__code">{sent.ref_code}</p>
                  <p className="receipt__flag">Provisional. Not yet reviewed by NUSSU.</p>
                </header>
                <section className="receipt__card" aria-labelledby="form-sent">
                  <h2 id="form-sent">What was sent</h2>
                  <ul className="summary__rows">
                    {sent.rows.map((row) => {
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
                <section className="receipt__card" aria-labelledby="form-next">
                  <h2 id="form-next">What happens next</h2>
                  <p className="body">
                    Being included here is not a decision. NUSSU reviews what was sent, then may raise it with the office
                    responsible, ask for more, or explain why it can't act. The update will say what was raised, what
                    changed, and what did not.
                  </p>
                  <p className={sent.withdrawn ? 'body' : 'visually-hidden'} role="status">
                    {sent.withdrawn ? 'Withdrawn. Your account will not be included.' : ''}
                  </p>
                  {sent.withdrawn ? null : withdrawing ? (
                    <InlineConfirm
                      sentence={`Withdraw ${sent.ref_code}? It will not be included.`}
                      secondary={{ label: 'Keep', onClick: () => setWithdrawing(false) }}
                      primary={{ label: 'Withdraw', onClick: () => void withdraw() }}
                      busy={busy}
                    />
                  ) : (
                    <button type="button" className="receipt__link" onClick={() => setWithdrawing(true)}>
                      Withdraw my account
                    </button>
                  )}
                  {error && <p className="muted" role="alert">{error}</p>}
                  <details className="receipt__notice">
                    <summary className="receipt__link">Data notice</summary>
                    {consentRows(consultation.why, consultation.closing_date, 'form').map((row) => (
                      <div key={row.title} className="receipt__notice-row">
                        <h3>{row.title}</h3>
                        <p>{row.body}</p>
                      </div>
                    ))}
                  </details>
                </section>
                <button type="button" className="btn btn--primary" onClick={() => { setSent(null); setEnd('done'); }}>
                  Done
                </button>
              </div>
            ) : stage === 'deleted' ? (
              <div className="card">
                <p className="body">Deleted. Nothing was sent.</p>
                <button type="button" className="btn btn--retry" onClick={() => setEnd(null)}>Start again</button>
              </div>
            ) : stage === 'done' ? (
              <p className="body">{closedLine(consultation.closing_date)}</p>
            ) : stage === 'consent' ? (
              <ConsentCard consultation={consultation} busy={busy} channel="form" onAgree={() => go('overall')} />
            ) : stage === 'overall' ? (
              <OverallQuestion
                consultation={consultation}
                busy={busy}
                onAnswer={(value) => {
                  setDraft((d) => ({ ...d, overall: value }));
                  go('fields');
                }}
              />
            ) : stage === 'fields' ? (
              <form
                className="card form-questions"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (ready) go('review');
                }}
              >
                <h1 className="question">Five questions, in your own words</h1>
                <p className="note">Answer the ones you can. Leave a box empty to skip that question.</p>
                {fields.map((f) => (
                  <label key={f.dim} className="field">
                    <span className="field__label">{f.label}</span>
                    {f.hint && <span className="field__hint">{f.hint}</span>}
                    <textarea
                      className="field__input"
                      rows={3}
                      value={draft.answers[f.dim] ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, answers: { ...d.answers, [f.dim]: e.target.value } }))}
                    />
                  </label>
                ))}
                <p className="muted">Nothing is sent yet. You check your answers on the next page.</p>
                {stopping ? stop : (
                  <ActionPair
                    secondary={{ label: 'Stop and delete', onClick: () => setStopping(true) }}
                    primary={{ label: 'Review answers', onClick: () => ready && go('review'), disabled: !ready }}
                  />
                )}
                {!ready && !stopping && <p className="muted">Answer at least one question to go on.</p>}
              </form>
            ) : (
              <section className="card summary" aria-labelledby="form-review-title">
                <p className="muted">Nothing is sent yet.</p>
                <h1 id="form-review-title">Is anything here wrong, missing or overstated?</h1>
                <ul className="summary__rows">
                  {reviewRows(draft, fields).map((row) => {
                    if (editing === row.key) {
                      return (
                        <li key={row.key} className="summary__row">
                          <SummaryRowEdit
                            row={row}
                            busy={busy}
                            onCancel={() => setEditing(null)}
                            onSave={(text) => {
                              setEditing(null);
                              setDraft((d) => withReviewEdit(d, row.key, text));
                            }}
                          />
                        </li>
                      );
                    }
                    const shown = rowDisplay(row);
                    return (
                      <li key={row.key} className="summary__row">
                        <div className="summary__content">
                          <p className="summary__label">{row.label}</p>
                          <p className={shown.muted ? 'summary__text summary__text--muted' : 'summary__text'}>{shown.text}</p>
                          {shown.note && <p className="summary__note">{shown.note}</p>}
                        </div>
                        {row.key !== 'overall' && (
                          <button
                            type="button"
                            className="summary__edit-button"
                            aria-label={`Edit ${row.label}`}
                            disabled={busy}
                            onClick={() => setEditing(row.key)}
                          >
                            Edit
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <p className="muted">
                  NUSSU's consultation team sees these answers. It does not see your name or student ID. Nothing has been sent.
                </p>
                {stopping ? stop : (
                  <>
                    <ActionPair
                      secondary={{ label: 'Back to questions', onClick: () => go('fields'), disabled: busy }}
                      primary={{ label: busy ? 'Sending…' : 'Submit', onClick: () => void submit(), disabled: busy || !ready || editing !== null }}
                    />
                    <button type="button" className="receipt__link" disabled={busy} onClick={() => setStopping(true)}>
                      Stop and delete
                    </button>
                  </>
                )}
                {!ready && <p className="muted">Answer at least one question before sending.</p>}
                {error && <p className="muted" role="alert">{error}</p>}
              </section>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
