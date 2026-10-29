import { ActionPair } from './ActionPair.tsx';

export const FALLBACK_QUESTIONS = [
  'What happened',
  'How often does it happen',
  'How did it affect you',
  'Did you experience it yourself, see it, or hear about it',
  'What would a better experience look like',
];

type Props = {
  /** One value per question. Held by the parent, so closing the form keeps what was typed. */
  answers: string[];
  /** Indices the server has already taken; they are shown, not sent again. */
  posted: number[];
  busy: boolean;
  onChange: (index: number, text: string) => void;
  onCancel: () => void;
  /** The answers still to send, in order. */
  onSubmit: (items: { index: number; text: string }[]) => void;
};

export function FallbackForm({ answers, posted, busy, onChange, onCancel, onSubmit }: Props) {
  const items = answers
    .map((text, index) => ({ index, text: text.trim() }))
    .filter((item) => item.text !== '' && !posted.includes(item.index));
  // After a partial send there may be nothing new to post, only the summary left to ask for.
  const ready = items.length > 0 || posted.length > 0;

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !busy) onSubmit(items);
      }}
    >
      <h2 className="fallback__title">Write your answers here instead</h2>
      <p className="note">The assistant did not reply twice in a row. Answer any of these, in your own words. Leave a box empty to skip it.</p>
      {FALLBACK_QUESTIONS.map((label, i) => {
        const sent = posted.includes(i);
        return (
          <label key={label} className="field">
            <span className="field__label">{sent ? `${label} (sent)` : label}</span>
            <textarea
              className="field__input"
              rows={3}
              value={answers[i]}
              readOnly={sent}
              onChange={(e) => onChange(i, e.target.value)}
            />
          </label>
        );
      })}
      <ActionPair
        secondary={{ label: 'Cancel', onClick: onCancel, disabled: busy }}
        primary={{ label: 'Check my summary', onClick: () => ready && onSubmit(items), disabled: busy || !ready }}
      />
    </form>
  );
}
