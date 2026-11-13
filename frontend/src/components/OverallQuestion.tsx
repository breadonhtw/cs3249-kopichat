import { useState } from 'react';
import type { Consultation } from '../api/client.ts';
import { ActionPair } from './ActionPair.tsx';

type Props = { consultation: Consultation; busy: boolean; onAnswer: (value: string | null) => void };

export function OverallQuestion({ consultation, busy, onAnswer }: Props) {
  const [choice, setChoice] = useState<string | null>(null);

  return (
    <section className="card">
      <h1 id="overall-q" className="question">
        {consultation.overall_question ?? 'Overall, how has campus visitor presence affected your experience recently?'}
      </h1>
      <fieldset className="choices" aria-labelledby="overall-q">
        {consultation.overall_options.map((option) => (
          <label key={option} className={option === choice ? 'choice choice--on' : 'choice'}>
            <input type="radio" name="overall" value={option} checked={option === choice} onChange={() => setChoice(option)} />
            <span>{option}</span>
          </label>
        ))}
      </fieldset>
      <p className="note">This records your general impression only. It doesn't decide what caused anything you describe next.</p>
      <ActionPair
        secondary={{ label: 'Skip', onClick: () => onAnswer(null), disabled: busy }}
        primary={{ label: 'Continue', onClick: () => onAnswer(choice), disabled: choice === null || busy }}
      />
    </section>
  );
}
