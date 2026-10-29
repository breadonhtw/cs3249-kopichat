import type { FallbackAnswers } from '../api/client.ts';
import { ActionPair } from './ActionPair.tsx';

export const FALLBACK_QUESTIONS = [
  'What happened',
  'How often does it happen',
  'How did it affect you',
  'Did you experience it yourself, see it, or hear about it',
  'What would a better experience look like',
];

/** The dimension each question answers, in the same order. */
const FALLBACK_KEYS = ['q1_what', 'q2_often', 'q3_effect', 'q4_basis', 'q5_better'] as const;

/** The answers to send, by dimension, in question order. Empty boxes are skipped questions and are left out. */
export function fallbackAnswers(answers: string[]): FallbackAnswers {
  const out: FallbackAnswers = {};
  FALLBACK_KEYS.forEach((key, i) => {
    const text = (answers[i] ?? '').trim();
    if (text !== '') out[key] = text;
  });
  return out;
}

type Props = {
  /** One value per question. Held by the parent, so closing the form keeps what was typed. */
  answers: string[];
  busy: boolean;
  onChange: (index: number, text: string) => void;
  onCancel: () => void;
  /** All the written answers, sent together. */
  onSubmit: (answers: FallbackAnswers) => void;
};

export function FallbackForm({ answers, busy, onChange, onCancel, onSubmit }: Props) {
  const toSend = fallbackAnswers(answers);
  const ready = Object.keys(toSend).length > 0;

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !busy) onSubmit(toSend);
      }}
    >
      <h2 className="fallback__title">Write your answers here instead</h2>
      <p className="note">The assistant did not reply twice in a row. Answer any of these, in your own words. Leave a box empty to skip it.</p>
      {FALLBACK_QUESTIONS.map((label, i) => (
        <label key={label} className="field">
          <span className="field__label">{label}</span>
          <textarea className="field__input" rows={3} value={answers[i]} onChange={(e) => onChange(i, e.target.value)} />
        </label>
      ))}
      <ActionPair
        secondary={{ label: 'Cancel', onClick: onCancel, disabled: busy }}
        primary={{ label: 'Check my summary', onClick: () => ready && onSubmit(toSend), disabled: busy || !ready }}
      />
    </form>
  );
}
