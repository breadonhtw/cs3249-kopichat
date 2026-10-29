import { useEffect, useRef, useState } from 'react';
import type { ThreadItem } from '../useSession.ts';

/** How long a request may take before the thread says it is reading. Shorter waits show nothing. */
export const WAIT_MS = 400;

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
  return overall === null ? 'Overall view skipped (saved separately)' : `Your overall view: ${overall} (saved separately)`;
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

  const shown = items.filter((item) => item.text !== '');
  let lastAgent = -1;
  shown.forEach((item, i) => {
    if (item.role === 'agent') lastAgent = i;
  });

  const all: ThreadItem[] = [{ role: 'status', text: overallLine(overall) }];
  shown.forEach((item, i) => {
    all.push(item);
    if (i === lastAgent && counter !== '') all.push({ role: 'status', text: counter });
  });
  if (slow) all.push({ role: 'status', text: 'Reading your reply…' });

  return (
    <div className="thread" role="log" aria-label="Conversation">
      {all.map((item, i) => (
        <p key={i} className={renderItemClass(item)}>
          {item.text}
        </p>
      ))}
      <div ref={end} className="thread__end" aria-hidden="true" />
    </div>
  );
}
