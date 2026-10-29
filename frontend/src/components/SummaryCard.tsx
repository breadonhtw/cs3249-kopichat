import { useEffect, useState } from 'react';
import type { SummaryRow } from '../api/client.ts';
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

type Props = {
  rows: SummaryRow[];
  busy: boolean;
  error: string | null;
  onEdit: (key: string, text: string) => void;
  onBack: () => void;
  onApprove: () => void;
  onRetry: () => void;
};

export function SummaryCard({ rows, busy, error, onEdit, onBack, onApprove, onRetry }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

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
      <p className="muted">
        NUSSU's consultation team sees these fields and your replies. It does not see your name or student ID. Nothing has been sent.
      </p>
      <ActionPair
        secondary={{ label: 'Back to chat', onClick: onBack, disabled: busy }}
        primary={{
          label: sending ? 'Sending…' : 'Approve and send',
          onClick: () => {
            setSending(true);
            onApprove();
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
