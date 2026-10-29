import { useCallback, useEffect, useRef, useState } from 'react';
import { isDeletePrompt } from '../chips.ts';
import { isCrisis, type useSession } from '../useSession.ts';
import { ChipRow } from './ChipRow.tsx';
import { Composer } from './Composer.tsx';
import { FALLBACK_QUESTIONS, FallbackForm } from './FallbackForm.tsx';
import { InlineConfirm } from './InlineConfirm.tsx';
import { OverflowMenu } from './OverflowMenu.tsx';
import { Thread } from './Thread.tsx';

type Props = { session: ReturnType<typeof useSession> };

/** The conversation: the thread as a record, and below it one thing to do at a time. */
export function ChatScreen({ session }: Props) {
  const { state } = session;
  const input = useRef<HTMLTextAreaElement>(null);
  const root = useRef<HTMLDivElement>(null);

  // The written fallback opens after two failures in a row and stays open until it is cancelled or sent.
  // After a cancel it returns only on a further failure. What was typed is kept either way.
  const [open, setOpen] = useState(false);
  const [closedAt, setClosedAt] = useState(0);
  const [answers, setAnswers] = useState<string[]>(() => FALLBACK_QUESTIONS.map(() => ''));
  useEffect(() => {
    if (state.unavailableStreak === 0) setClosedAt(0);
    else if (state.unavailableStreak >= 2 && state.unavailableStreak > closedAt) setOpen(true);
  }, [state.unavailableStreak, closedAt]);

  // The sticky dock covers the bottom of the page; the thread scrolls its newest line clear of it.
  const [dock, setDock] = useState<HTMLDivElement | null>(null);
  const dockRef = useCallback((el: HTMLDivElement | null) => setDock(el), []);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (!dock) {
      el.style.setProperty('--dock-height', '0px');
      return;
    }
    const measure = () => el.style.setProperty('--dock-height', `${dock.offsetHeight}px`);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(dock);
    return () => observer.disconnect();
  }, [dock]);

  const transcript = state.serverState?.transcript;
  const answered = Array.isArray(transcript) ? transcript.length : 0;
  const lastAgent = [...state.thread].reverse().find((item) => item.role === 'agent');
  const crisis = isCrisis(state.serverState);
  const fallback = open && !crisis;
  const confirming = !fallback && isDeletePrompt(state.chips);

  function onChip(label: string) {
    if (label === 'Pause') input.current?.blur();
    void session.chip(label);
  }

  return (
    <div className="chat" ref={root}>
      <Thread items={state.thread} overall={state.overall} counter={state.counter} busy={state.busy} />
      {crisis ? (
        <div className="dock" ref={dockRef}>
          <InlineConfirm
            sentence="The questions are paused. Nothing has been sent."
            busy={state.busy}
            secondary={{ label: 'Delete what I typed', onClick: () => void session.del() }}
            primary={{ label: 'Close', onClick: session.close }}
          />
        </div>
      ) : fallback ? (
        <FallbackForm
          answers={answers}
          posted={state.fallbackPosted}
          busy={state.busy}
          onChange={(i, text) => setAnswers(answers.map((a, j) => (j === i ? text : a)))}
          onCancel={() => {
            setOpen(false);
            setClosedAt(state.unavailableStreak);
          }}
          onSubmit={(items) => void session.submitFallback(items)}
        />
      ) : (
        <div className="dock" ref={dockRef}>
          {confirming ? (
            <InlineConfirm
              sentence={lastAgent?.text ?? ''}
              busy={state.busy}
              secondary={{ label: 'Delete', onClick: () => void session.del() }}
              primary={{ label: 'Keep draft', onClick: () => void session.chip('Keep draft') }}
            />
          ) : (
            <>
              <div className="dock__top">
                <ChipRow
                  chips={state.chips}
                  options={state.options}
                  transcriptLength={answered}
                  phase={state.phase}
                  busy={state.busy}
                  onChip={onChip}
                  onOption={(i) => void session.option(i)}
                />
                <OverflowMenu
                  busy={state.busy}
                  onAnonymous={() => void session.chip('Is this anonymous?')}
                  onStop={() => void session.chip('Stop and delete')}
                />
              </div>
              <Composer busy={state.busy} onSend={session.send} inputRef={input} draft={state.draft} onDraftTaken={session.draftTaken} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
