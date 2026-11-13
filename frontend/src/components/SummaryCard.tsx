import { useEffect, useState } from 'react';
import { DEFAULT_VISIBILITY, type SummaryRow, type Visibility } from '../api/client.ts';
import { ActionPair } from './ActionPair.tsx';
import { SummaryRowEdit } from './SummaryRowEdit.tsx';

type Display = { text: string; muted: boolean; note: string | null };

/** How a row reads on the screen. The text is the server's, never reworded; only the quotation marks are added. */
export function rowDisplay(row: SummaryRow): Display {
  switch (row.status) {
    case 'not_given':
      return { text: 'not given', muted: true, note: null };
    case 'skipped':
      return { text: 'skipped', muted: true, note: null };
    case 'edited':
      return { text: `“${row.text}”`, muted: false, note: 'edited by you' };
    default:
      return { text: `“${row.text}”`, muted: false, note: null };
  }
}

/** The two answers to "Who may see your words?", in the order shown. The first is the default. */
export const VISIBILITY_CHOICES: { value: Visibility; label: string }[] = [
  { value: 'nussu', label: 'NUSSU’s consultation team only' },
  { value: 'board', label: 'NUSSU’s team and other students' },
];

type Props = {
  rows: SummaryRow[];
  busy: boolean;
  error: string | null;
  onEdit: (key: string, text: string) => void;
  onBack: () => void;
  /** Approve and send, with the student's choice of who may see their words. */
  onApprove: (visibility: Visibility) => void;
  onRetry: () => void;
};

export function SummaryCard({ rows, busy, error, onEdit, onBack, onApprove, onRetry }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>(DEFAULT_VISIBILITY);

  useEffect(() => {
    if (!busy) setSending(false);
  }, [busy]);

  return (
    <section className="card summary" aria-labelledby="summary-title">
      <p className="muted">Nothing is sent yet.</p>
      <h1 id="summary-title">Is anything here wrong, missing or overstated?</h1>
      {rows.length === 0 ? (
        !busy && (
          <button type="button" className="btn btn--retry" onClick={onRetry}>
            Try again
          </button>
        )
      ) : (
        <ul className="summary__rows">
          {rows.map((row) => {
            if (editing === row.key) {
              return (
                <li key={row.key} className="summary__row">
                  <SummaryRowEdit
                    row={row}
                    busy={busy}
                    onCancel={() => setEditing(null)}
                    onSave={(text) => {
                      setEditing(null);
                      onEdit(row.key, text);
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
      )}
      {rows.length > 0 && (
        <fieldset className="choices visibility" aria-describedby="visibility-note">
          <legend className="visibility__legend">Who may see your words?</legend>
          {VISIBILITY_CHOICES.map((choice) => (
            <label key={choice.value} className={choice.value === visibility ? 'choice choice--on' : 'choice'}>
              <input
                type="radio"
                name="visibility"
                value={choice.value}
                checked={choice.value === visibility}
                disabled={busy}
                onChange={() => setVisibility(choice.value)}
              />
              <span>{choice.label}</span>
            </label>
          ))}
          <p id="visibility-note" className="note">
            Either way your account is counted and NUSSU reads it. With other students, the first line of “What happened” is
            pinned on the noticeboard that students see after sending their own account, without your reference code.
          </p>
        </fieldset>
      )}
      <p className="muted">
        NUSSU's consultation team sees these fields and your replies. It does not see your name or student ID. Nothing has been sent.
      </p>
      <ActionPair
        secondary={{ label: 'Back to chat', onClick: onBack, disabled: busy }}
        primary={{
          label: sending ? 'Sending…' : 'Approve and send',
          onClick: () => {
            setSending(true);
            onApprove(visibility);
          },
          disabled: busy || rows.length === 0,
        }}
      />
      {error && (
        <p className="muted" role="status">
          {error}
        </p>
      )}
    </section>
  );
}
