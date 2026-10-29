import { useEffect, useRef, useState } from 'react';
import { client } from './api/clientInstance.ts';
import { closedLine } from './closedLine.ts';
import { ChatScreen } from './components/ChatScreen.tsx';
import { ConsentCard } from './components/ConsentCard.tsx';
import { DemoBar } from './components/DemoBar.tsx';
import { NoticeStrip } from './components/NoticeStrip.tsx';
import { OverallQuestion } from './components/OverallQuestion.tsx';
import { Receipt } from './components/Receipt.tsx';
import { screenFor } from './screenFor.ts';
import { SummaryCard } from './components/SummaryCard.tsx';
import { isEditableTarget, isToggleKey, SystemView } from './components/SystemView.tsx';
import { useMinWidth } from './useMinWidth.ts';
import { useSession } from './useSession.ts';

/** The system view needs a laptop; below this width it is not rendered at all. */
const LAPTOP_PX = 1024;

export function App() {
  const session = useSession(client);
  const { state } = session;
  const { consultation } = state;
  // Looking back at the thread from the summary is a client-only view: the server is already at the summary.
  const [lookingBack, setLookingBack] = useState(false);
  const requested = useRef(false);
  const laptop = useMinWidth(LAPTOP_PX);
  // The presenter's system view: closed by default, opened with the button or the `s` key.
  const [systemOpen, setSystemOpen] = useState(false);
  const inSummary = state.phase === 'summary';
  const { loadSummary } = session;

  // The summary is fetched once on entering the phase, as soon as no other request is in flight.
  useEffect(() => {
    if (!inSummary) {
      requested.current = false;
      setLookingBack(false);
    } else if (!requested.current && !state.busy) {
      requested.current = true;
      void loadSummary();
    }
  }, [inSummary, state.busy, loadSummary]);

  useEffect(() => {
    if (!laptop) return;
    const onKey = (e: KeyboardEvent) => {
      if (!isToggleKey(e) || isEditableTarget(e.target as HTMLElement | null)) return;
      setSystemOpen((open) => !open);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [laptop]);

  const screen = screenFor(state, inSummary && lookingBack);
  const onOverall = screen === 'overall';
  const onSummary = screen === 'summary';
  const onChat = screen === 'chat';
  // A withdrawal moves the server to `deleted`; the receipt stays up to say so.
  const onReceipt = screen === 'receipt' || screen === 'withdrawn';
  const stepped = onOverall || onChat || onSummary || onReceipt;

  const panelOpen = laptop && systemOpen;

  return (
    <div className="layout">
      <div className="phone">
        {laptop && (
          <div className="phone__bar">
            <button type="button" className="sysview-toggle" aria-pressed={systemOpen} onClick={() => setSystemOpen((open) => !open)}>
              System view
            </button>
          </div>
        )}
        {laptop && import.meta.env.DEV && (
          <DemoBar phase={state.phase} busy={state.busy} onRestart={() => void session.restart()} onSend={(text) => void session.send(text)} />
        )}
        <div className="shell">
          <NoticeStrip
            line1={stepped && consultation !== null ? consultation.title : 'Kopichat'}
            line2={onOverall ? 'Step 1 of 3' : onChat ? 'Step 2 of 3' : onSummary || onReceipt ? 'Step 3 of 3' : 'NUSSU consultation'}
            step={onOverall ? 1 : onChat ? 2 : onSummary || onReceipt ? 3 : undefined}
            fictional
          />
          {state.error && !onSummary && (
            <p className="muted" role="alert">
              {state.error}
            </p>
          )}
          {state.error && consultation === null && (
            <button type="button" className="btn btn--retry" onClick={session.retry}>
              Try again
            </button>
          )}
          <main className="main">
            {consultation === null ? (
              screen === 'loading' && <p className="muted">Opening the consultation.</p>
            ) : screen === 'consent' ? (
              <ConsentCard consultation={consultation} busy={state.busy} onAgree={session.consent} />
            ) : onOverall ? (
              <OverallQuestion consultation={consultation} busy={state.busy} onAnswer={session.overall} />
            ) : onSummary ? (
              <SummaryCard
                rows={state.summary}
                busy={state.busy}
                error={state.error}
                onEdit={(key, text) => void session.edit(key, text)}
                onBack={() => setLookingBack(true)}
                onApprove={() => void session.approve()}
                onRetry={() => void session.loadSummary()}
              />
            ) : onChat ? (
              <ChatScreen session={session} readOnly={inSummary} onCheckSummary={() => setLookingBack(false)} />
            ) : onReceipt ? (
              <Receipt
                consultation={consultation}
                account={state.account}
                aggregate={state.aggregate}
                summary={state.summary}
                withdrawn={screen === 'withdrawn'}
                replay={!state.restoredReceipt}
                busy={state.busy}
                onWithdraw={session.withdraw}
                onContact={session.contact}
                onDone={session.close}
              />
            ) : screen === 'deleted' ? (
              <div className="card">
                <p className="body">Deleted. Nothing was sent.</p>
                <button type="button" className="btn btn--retry" disabled={state.busy} onClick={() => void session.restart()}>
                  Start again
                </button>
              </div>
            ) : (
              <p className="body">{closedLine(consultation.closing_date)}</p>
            )}
          </main>
        </div>
      </div>
      {laptop && (
        // The slot is always reserved at laptop width, so the phone column does not move when the panel opens.
        <div className={panelOpen ? 'layout__panel layout__panel--open' : 'layout__panel'} aria-hidden={panelOpen ? undefined : true}>
          <SystemView state={state.serverState} previous={state.previousServerState} open={panelOpen} counter={state.counter} aggregate={state.aggregate} />
        </div>
      )}
    </div>
  );
}
