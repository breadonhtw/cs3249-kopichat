import { useEffect, useRef, useState } from 'react';
import type { ThreadItem } from '../useSession.ts';

/** How long a request may take before the thread says it is reading. Shorter waits show nothing. */
export const WAIT_MS = 400;

/** The name shown once, above the first agent message: the product, not a persona. */
export const AGENT_NAME = 'Kopichat';

export function renderItemClass(item: ThreadItem): string {
  return `turn turn--${item.role}`;
}

type Props = {
  items: ThreadItem[];
  /** The overall view given before the chat; null means it was skipped. */
  overall: string | null;
  counter: string;
  busy: boolean;
};

function overallLine(overall: string | null): string {
  return overall === null ? 'Overall view skipped, saved separately' : `Your overall view: ${overall}, saved separately`;
}

type Row =
  | { kind: 'item'; item: ThreadItem; key: string }
  | { kind: 'who'; key: string }
  | { kind: 'foot'; text: string; key: string }
  | { kind: 'reading'; key: string };

/**
 * The rows the thread draws, in order: the overall view as a system line; a name above the first agent message; each
 * message as its own bubble; the counter as the foot of the latest agent bubble; and, while the agent is reading, an
 * agent bubble that says so.
 */
export function threadRows(items: ThreadItem[], overall: string | null, counter: string, reading: boolean): Row[] {
  const shown = items.filter((item) => item.text !== '');
  let lastAgent = -1;
  shown.forEach((item, i) => {
    if (item.role === 'agent') lastAgent = i;
  });
  const rows: Row[] = [{ kind: 'item', item: { role: 'status', text: overallLine(overall) }, key: 'overall' }];
  let named = false;
  shown.forEach((item, i) => {
    if (item.role === 'agent' && !named) {
      rows.push({ kind: 'who', key: 'who' });
      named = true;
    }
    rows.push({ kind: 'item', item, key: `item-${i}` });
    if (i === lastAgent && counter !== '') rows.push({ kind: 'foot', text: counter, key: `foot-${i}` });
  });
  if (reading) rows.push({ kind: 'reading', key: 'reading' });
  return rows;
}

export function Thread({ items, overall, counter, busy }: Props) {
  const [slow, setSlow] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!busy) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), WAIT_MS);
    return () => clearTimeout(timer);
  }, [busy]);

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'nearest' });
  }, [items.length, slow]);

  return (
    <div className="thread" role="log" aria-label="Conversation">
      {threadRows(items, overall, counter, slow).map((row) => {
        switch (row.kind) {
          case 'who':
            return (
              <p key={row.key} className="thread__who">
                {AGENT_NAME}
              </p>
            );
          case 'foot':
            return (
              <p key={row.key} className="turn turn--foot">
                {row.text}
              </p>
            );
          case 'reading':
            return (
              <p key={row.key} className="turn turn--agent turn--reading" role="status">
                Reading your reply…
              </p>
            );
          default:
            return (
              <p key={row.key} className={renderItemClass(row.item)}>
                {row.item.text}
              </p>
            );
        }
      })}
      <div ref={end} className="thread__end" aria-hidden="true" />
    </div>
  );
}
