import { useEffect, useRef, useState } from 'react';
import type { Consultation, ReviewGroup, Strip as StripData } from '../api/client.ts';
import { client } from '../api/clientInstance.ts';
import { reducedMotion } from '../motion.ts';
import { groupFromSearch, pickGroup, refFromSearch, searchWithGroup, groupsByTheme } from '../reviewLines.ts';
import { Strip } from './Strip.tsx';

const NARROW = '(max-width: 1023.98px)'; // below this the group list sits above the strip, not beside it

/** The NUSSU reviewer view, at /review: the consultation's groups, and the chosen one as a comic strip. */
export function Review() {
  const [consultation, setConsultation] = useState<Consultation | null>(null);
  const [groups, setGroups] = useState<ReviewGroup[] | null>(null);
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
          {groups === null ? (
            !error && <p className="review__meta">Loading groups.</p>
          ) : groups.length === 0 ? (
            <p className="review__meta">No accounts yet. Groups appear here once students send accounts and they are grouped.</p>
          ) : (
            <ul className="review__list">
              {groupsByTheme(groups).map((section) => (
                <li key={section.theme} className="review__theme">
                  <h2 className="review__theme-head" id={`theme-${section.theme}`}>
                    <span className="review__theme-name">{section.label}</span>
                    <span className="review__theme-count">
                      {section.total}
                      <span className="visually-hidden">{section.total === 1 ? ' account' : ' accounts'}</span>
                    </span>
                  </h2>
                  <ul className="review__theme-groups" aria-labelledby={`theme-${section.theme}`}>
                    {section.groups.map((g) => (
                      <li key={g.id}>
                        <button
                          type="button"
                          className="review__group"
                          aria-current={g.id === chosen ? 'true' : undefined}
                          onClick={() => choose(g.id)}
                        >
                          <span className="review__group-text">
                            <span className="review__group-name">{g.pending ? `${g.name} (pending)` : g.name}</span>
                          </span>
                          <span className="review__group-count">
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
