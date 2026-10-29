import { useState } from 'react';
import { ActionPair } from './ActionPair.tsx';

export const FALLBACK_QUESTIONS = [
  'What happened',
  'How often does it happen',
  'How did it affect you',
  'Did you experience it yourself, see it, or hear about it',
  'What would a better experience look like',
];

type Props = { busy: boolean; onCancel: () => void; onSubmit: (answers: string[]) => void };

export function FallbackForm({ busy, onCancel, onSubmit }: Props) {
  const [answers, setAnswers] = useState<string[]>(() => FALLBACK_QUESTIONS.map(() => ''));
  const given = answers.map((a) => a.trim()).filter((a) => a !== '');

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        if (given.length > 0) onSubmit(given);
      }}
    >
      <h2 className="fallback__title">Write your answers here instead</h2>
      <p className="note">The assistant did not reply twice in a row. Answer any of these, in your own words. Leave a box empty to skip it.</p>
      {FALLBACK_QUESTIONS.map((label, i) => (
        <label key={label} className="field">
          <span className="field__label">{label}</span>
          <textarea
            className="field__input"
            rows={3}
            value={answers[i]}
            onChange={(e) => setAnswers(answers.map((a, j) => (j === i ? e.target.value : a)))}
          />
        </label>
      ))}
      <ActionPair
        secondary={{ label: 'Cancel', onClick: onCancel, disabled: busy }}
        primary={{ label: 'Check my summary', onClick: () => given.length > 0 && onSubmit(given), disabled: busy || given.length === 0 }}
      />
    </form>
  );
}
