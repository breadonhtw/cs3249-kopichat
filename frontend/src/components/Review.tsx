import { useEffect, useRef, useState } from 'react';
import type { Consultation, ReviewContext, ReviewGroup, Strip as StripData } from '../api/client.ts';
import { client } from '../api/clientInstance.ts';
import { reducedMotion } from '../motion.ts';
import { COUNT_NOTES, groupFromSearch, periodLine, pickGroup, refFromSearch, searchWithGroup, seedsLine, groupsByTheme, groupsSummary } from '../reviewLines.ts';
import { Strip } from './Strip.tsx';

const NARROW = '(max-width: 1023.98px)'; // below this the group list sits above the strip, not beside it

/** The NUSSU reviewer view, at /review: the consultation's groups, and the chosen one as a comic strip. */
export function Review() {
  const [consultation, setConsultation] = useState<Consultation | null>(null);
  const [groups, setGroups] = useState<ReviewGroup[] | null>(null);
  const [context, setContext] = useState<ReviewContext | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [strip, setStrip] = useState<StripData | null>(null);
  const [error, setError] = useState<{ what: 'groups' | 'strip'; detail: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Opened from the demo's jump (?ref=KR-1234): start on that account's group and mark its lines.
  const [ref] = useState(() => refFromSearch(window.location.search));
  const [missing, setMissing] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const userChose = useRef(false);

  useEffect(() => {
    const located = ref === null ? Promise.resolve(null) : client.reviewLocate(ref).then((r) => r.group_id).catch(() => null);
    Promise.all([client.reviewGroups(), located])
      .then(([body, groupId]) => {
        setError(null);
        setConsultation(body.consultation);
        setGroups(body.groups);
        setContext(body.context ?? null);
        setMissing(ref !== null && groupId === null);
        // The group chosen last wins over the jump's, so a reload stays where the reviewer was.
        const ids = body.groups.map((g) => g.id);
        setChosen(groupFromSearch(window.location.search, ids) ?? groupId ?? pickGroup(body.groups));
      })
      .catch((e: Error) => setError({ what: 'groups', detail: e.message }));
  }, [ref, attempt]);

  useEffect(() => {
    if (consultation) document.title = `NUSSU review: ${consultation.title}`;
    document.querySelector('meta[name="description"]')?.setAttribute('content',
      "NUSSU's reviewer view of a consultation: students' accounts in groups, each line quoted with who said it.");
  }, [consultation]);

  useEffect(() => {
    if (chosen === null) return;
    let live = true;
    // The strip on screen stays, dimmed, until the next one arrives: no collapse, no jump.
    client
      .reviewStrip(chosen)
      .then((s) => {
        if (!live) return;
        setError(null);
        setStrip(s);
      })
      .catch((e: Error) => live && setError({ what: 'strip', detail: e.message }));
    return () => {
      live = false;
    };
  }, [chosen, attempt]);

  // On a narrow screen the list fills the first screen; after a choice, bring the strip up so the tap shows something.
  useEffect(() => {
    if (!strip || !userChose.current) return;
    userChose.current = false;
    if (window.matchMedia(NARROW).matches) {
      mainRef.current?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    }
  }, [strip]);

  function choose(id: string) {
    userChose.current = true;
    setChosen(id);
    window.history.replaceState(null, '', `${window.location.pathname}${searchWithGroup(window.location.search, id)}`);
  }

  const loading = strip !== null && strip.group.id !== chosen && !error;

  return (
    <div className="review">
      <header className="review__head">
        <p className="review__kicker">NUSSU reviewer view. Demo: there is no sign-in here; a real one would need it.</p>
        <h1 className="review__title">{consultation?.title ?? 'Consultation'}</h1>
        <p className="review__meta">
          Groups are provisional. Every caption is a student's own words with who said it; the pictures only illustrate.
        </p>
        <div className="review__about">
          {context && (
            <section aria-labelledby="review-context">
              <h2 id="review-context" className="review__about-title">This consultation</h2>
              <dl className="facts">
                <div className="facts__row"><dt>Period</dt><dd>{periodLine(context)}</dd></div>
                <div className="facts__row"><dt>How students were reached</dt><dd>{context.reach}</dd></div>
                <div className="facts__row"><dt>Accounts</dt><dd>{seedsLine(context)}</dd></div>
              </dl>
            </section>
          )}
          <section aria-labelledby="review-counts">
            <h2 id="review-counts" className="review__about-title">What the counts count</h2>
            <dl className="facts">
              {COUNT_NOTES.map((note) => (
                <div key={note.term} className="facts__row"><dt>{note.term}</dt><dd>{note.body}</dd></div>
              ))}
            </dl>
          </section>
        </div>
      </header>

      {error && (
        <div className="review__error" role="alert">
          <p>
            {error.what === 'groups' ? 'The groups did not load' : 'This group did not load'} ({error.detail}). Check the
            backend is running, then try again.
          </p>
          <button type="button" className="btn btn--retry" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
        </div>
      )}
      {missing && <p className="review__meta" role="status">{ref} is not in the consultation: it was withdrawn, or the reference is wrong.</p>}

      <div className="review__body">
        <nav className="review__groups" aria-label="Groups">
          <h2 className="register__title">Groups</h2>
          {groups === null ? (
            !error && (
              <div className="register__loading" role="status" aria-label="Loading groups">
                <span className="register__bone register__bone--head" />
                <span className="register__bone" />
                <span className="register__bone" />
                <span className="register__bone register__bone--short" />
              </div>
            )
          ) : groups.length === 0 ? (
            <p className="review__meta">No accounts yet. Groups appear here once students send accounts and they are grouped.</p>
          ) : (
            <>
              <p className="register__summary">{groupsSummary(groups)}</p>
              <ul className="register">
                {groupsByTheme(groups).map((section) => (
                  <li key={section.theme} className="register__theme">
                    <h3 className="register__head" id={`theme-${section.theme}`}>
                      <span className="register__theme-name">{section.label}</span>
                      <span className="register__theme-total">
                        {section.total}
                        <span className="visually-hidden">{section.total === 1 ? ' account' : ' accounts'}</span>
                      </span>
                    </h3>
                    <ul className="register__rows" aria-labelledby={`theme-${section.theme}`}>
                      {section.groups.map((g) => (
                        <li key={g.id}>
                          <button
                            type="button"
                            className="register__row"
                            aria-current={g.id === chosen ? 'true' : undefined}
                            onClick={() => choose(g.id)}
                          >
                            <span className="register__name">
                              {g.name}
                              {g.pending && <span className="register__state">pending</span>}
                            </span>
                            <span className="register__count">
                              {g.count}
                              <span className="visually-hidden">{g.count === 1 ? ' account' : ' accounts'}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </>
          )}
        </nav>

        <main className="review__main" ref={mainRef}>
          {strip ? (
            <Strip strip={strip} highlight={ref} stale={loading} />
          ) : (
            chosen !== null && !error && <p className="review__meta" role="status">Loading the strip.</p>
          )}
        </main>
      </div>
    </div>
  );
}
