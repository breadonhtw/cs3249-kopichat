import type { Aggregate, DimState, ServerState } from '../api/client.ts';
import { themeLabel } from '../themeLabel.ts';

const DIMENSIONS: [key: string, label: string][] = [
  ['q1_what', 'Q1 What happened'],
  ['q2_often', 'Q2 How often'],
  ['q3_effect', 'Q3 Effect'],
  ['q4_basis', 'Q4 Basis'],
  ['q5_better', 'Q5 Better experience'],
];

/** Paths of the cells whose value differs between two server states, e.g. `q1_what.score`, `q1_what.checks.place`. Nothing differs from no earlier state. */
export function diffCells(prev: ServerState | null | undefined, next: ServerState | null | undefined): Set<string> {
  const changed = new Set<string>();
  if (!prev || !next) return changed;
  const dims = next.dims ?? {};
  for (const [key, dim] of Object.entries(dims)) {
    const before = prev.dims?.[key];
    if (before?.score !== dim.score) changed.add(`${key}.score`);
    if (before?.state !== dim.state) changed.add(`${key}.state`);
    for (const [check, span] of Object.entries(dim.checks ?? {})) {
      if ((before?.checks?.[check] ?? null) !== span) changed.add(`${key}.checks.${check}`);
    }
  }
  if ((prev.interpretation?.cause ?? null) !== (next.interpretation?.cause ?? null)) changed.add('interpretation.cause');
  if ((prev.interpretation?.uncertain ?? false) !== (next.interpretation?.uncertain ?? false)) changed.add('interpretation.uncertain');
  if ((prev.pending_question ?? null) !== (next.pending_question ?? null)) changed.add('pending_question');
  return changed;
}

/** The question waiting, or the summary once the questions are over. */
export function nextLine(state: ServerState): string {
  if (state.phase === 'summary') return 'Next: summary';
  const pending = state.pending_question;
  return typeof pending === 'string' && pending !== '' ? `Next: ${pending}` : 'Next: none';
}

export function storedLine(aggregate: Aggregate): string {
  return `Stored. Theme: ${themeLabel(aggregate.theme)}. Group: ${aggregate.group.name ?? 'none'}. Provisional.`;
}

/** True when a key press is going into a text control and must not be taken as a shortcut. */
export function isEditableTarget(el: { tagName?: string; isContentEditable?: boolean } | null | undefined): boolean {
  if (!el) return false;
  const tag = el.tagName?.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}

/** True for a plain press of `s` (any case, so Caps Lock is fine) that is not a held key and not part of a shortcut. */
export function isToggleKey(e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; repeat?: boolean }): boolean {
  return e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat;
}

const stateWord = (state: DimState['state']) => String(state).replaceAll('_', ' ');

type Props = {
  state: ServerState | null;
  previous: ServerState | null;
  open: boolean;
  counter?: string;
  aggregate?: Aggregate | null;
};

/** The presenter's view of the state behind each question. Not part of the student's experience, and never rendered on a phone. */
export function SystemView({ state, previous, open, counter = '', aggregate = null }: Props) {
  if (!open) return null;
  const changed = diffCells(previous, state);
  const cell = (path: string) => (changed.has(path) ? 'sysview__cell sysview__cell--changed' : 'sysview__cell');
  const dims = state?.dims ?? {};
  const cause = state?.interpretation?.cause ?? null;
  const uncertain = state?.interpretation?.uncertain === true;

  return (
    <aside className="sysview" aria-label="System view">
      <h2 className="sysview__title">System view</h2>
      <p className="sysview__lede">Not shown to students. Scores are LLM-produced and not yet validated against human raters.</p>
      {state === null ? (
        <p className="sysview__line">No state yet.</p>
      ) : (
        <>
          {DIMENSIONS.filter(([key]) => dims[key] !== undefined).map(([key, label]) => {
            const dim = dims[key]!;
            return (
              <section className="sysview__block" key={key}>
                <h3 className="sysview__label">{label}</h3>
                <p className="sysview__line">
                  <span className={`${cell(`${key}.score`)} num`}>{dim.score}</span>{' '}
                  <span className={cell(`${key}.state`)}>{stateWord(dim.state)}</span>
                </p>
                {Object.entries(dim.checks ?? {}).map(([check, span]) => (
                  <p className="sysview__line" key={check}>
                    <span className={cell(`${key}.checks.${check}`)}>
                      {check}: {span === null || span === undefined ? 'not given' : `“${span}”`}
                    </span>
                  </p>
                ))}
              </section>
            );
          })}
          <p className="sysview__line">
            Interpretation (not scored): cause{' '}
            <span className={cell('interpretation.cause')}>{cause === null ? 'not given' : `“${cause}”`}</span>
            {uncertain && <span className={cell('interpretation.uncertain')}>, uncertain</span>}
          </p>
          <p className={`sysview__line ${cell('pending_question')}`}>{nextLine(state)}</p>
          {counter !== '' && <p className="sysview__line">{counter}</p>}
          {aggregate !== null && <p className="sysview__line">{storedLine(aggregate)}</p>}
        </>
      )}
    </aside>
  );
}
