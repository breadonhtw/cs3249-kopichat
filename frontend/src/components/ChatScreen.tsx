import { useEffect, useRef, useState } from 'react';
import { isDeletePrompt } from '../chips.ts';
import { isCrisis, type useSession } from '../useSession.ts';
import { ChipRow } from './ChipRow.tsx';
import { Composer } from './Composer.tsx';
import { FallbackForm } from './FallbackForm.tsx';
import { InlineConfirm } from './InlineConfirm.tsx';
import { OverflowMenu } from './OverflowMenu.tsx';
import { Thread } from './Thread.tsx';

type Props = { session: ReturnType<typeof useSession> };

/** The conversation: the thread as a record, and below it one thing to do at a time. */
export function ChatScreen({ session }: Props) {
  const { state } = session;
  const input = useRef<HTMLTextAreaElement>(null);
  // The streak at which the student closed the written fallback; it returns only after another failure.
  const [closedAt, setClosedAt] = useState(0);
  useEffect(() => {
    if (state.unavailableStreak === 0) setClosedAt(0);
  }, [state.unavailableStreak]);

  const transcript = state.serverState?.transcript;
  const answered = Array.isArray(transcript) ? transcript.length : 0;
  const lastAgent = [...state.thread].reverse().find((item) => item.role === 'agent');
  const fallback = state.unavailableStreak >= 2 && state.unavailableStreak > closedAt;
  const crisis = isCrisis(state.serverState);
  const confirming = !fallback && isDeletePrompt(state.chips);

  function onChip(label: string) {
    if (label === 'Pause') input.current?.blur();
    void session.chip(label);
  }

  return (
    <div className="chat">
      <Thread items={state.thread} overall={state.overall} counter={state.counter} busy={state.busy} />
      {crisis ? (
        <div className="dock">
          <InlineConfirm
            sentence="The questions are paused. Nothing has been sent."
            busy={state.busy}
            secondary={{ label: 'Delete what I typed', onClick: () => void session.del() }}
            primary={{ label: 'Close', onClick: session.close }}
          />
        </div>
      ) : fallback ? (
        <FallbackForm
          busy={state.busy}
          onCancel={() => setClosedAt(state.unavailableStreak)}
          onSubmit={(answers) => void session.submitFallback(answers)}
        />
      ) : (
        <div className="dock">
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
              <Composer busy={state.busy} onSend={session.send} inputRef={input} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
