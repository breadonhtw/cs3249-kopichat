import { useEffect, useState } from 'react';
import type { Consultation, ReviewGroup, Strip as StripData } from '../api/client.ts';
import { client } from '../api/clientInstance.ts';
import { pickGroup } from '../reviewLines.ts';
import { themeShort } from '../themeLabel.ts';
import { Strip } from './Strip.tsx';

/** The NUSSU reviewer view, at /review: the consultation's groups, and the chosen one as a comic strip. */
export function Review() {
  const [consultation, setConsultation] = useState<Consultation | null>(null);
  const [groups, setGroups] = useState<ReviewGroup[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [strip, setStrip] = useState<StripData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    client
      .reviewGroups()
      .then((body) => {
        setConsultation(body.consultation);
        setGroups(body.groups);
        setChosen(pickGroup(body.groups));
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (chosen === null) return;
    let live = true;
    setStrip(null);
    client
      .reviewStrip(chosen)
      .then((s) => live && setStrip(s))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [chosen]);

  return (
    <div className="review">
      <header className="review__head">
        <p className="review__kicker">NUSSU reviewer view. Demo: there is no sign-in here; a real one would need it.</p>
        <h1 className="review__title">{consultation?.title ?? 'Consultation'}</h1>
        <p className="review__meta">
          Groups are provisional. Every caption is a student's own words with who said it; the pictures only illustrate.
        </p>
      </header>

      {error && <p className="review__error" role="alert">{error}</p>}

      <div className="review__body">
        <nav className="review__groups" aria-label="Groups">
          {groups === null ? (
            <p className="review__meta">Loading groups.</p>
          ) : (
            <ul className="review__list">
              {groups.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    className="review__group"
                    aria-current={g.id === chosen ? 'true' : undefined}
                    onClick={() => setChosen(g.id)}
                  >
                    <span className="review__group-name">{g.pending ? `${g.name} (pending)` : g.name}</span>
                    <span className="review__group-meta">
                      {themeShort(g.theme)}, {g.count === 1 ? '1 account' : `${g.count} accounts`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </nav>

        <main className="review__main">
          {strip ? <Strip strip={strip} /> : chosen !== null && !error && <p className="review__meta">Loading the strip.</p>}
        </main>
      </div>
    </div>
  );
}
