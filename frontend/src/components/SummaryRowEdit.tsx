import { useEffect, useRef, useState } from 'react';
import type { SummaryRow } from '../api/client.ts';
import { ActionPair } from './ActionPair.tsx';

type Props = {
  row: SummaryRow;
  busy: boolean;
  onSave: (text: string) => void;
  onCancel: () => void;
};

/** The row opened in place: the student's raw words in a field, to correct. No quotation marks, no animation. */
export function SummaryRowEdit({ row, busy, onSave, onCancel }: Props) {
  const [text, setText] = useState(row.text);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.focus();
    // The caret goes after the last word, so typing adds to the answer instead of landing in front of it.
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  return (
    <div className="summary__edit">
      <label className="summary__label" htmlFor={`edit-${row.key}`}>
        {row.label}
      </label>
      <textarea
        id={`edit-${row.key}`}
        ref={input}
        className="summary__input"
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <ActionPair
        secondary={{ label: 'Cancel', onClick: onCancel }}
        primary={{ label: 'Save', onClick: () => onSave(text.trim()), disabled: busy }}
      />
    </div>
  );
}
