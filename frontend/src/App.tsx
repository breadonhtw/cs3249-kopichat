import { useEffect, useRef, useState } from 'react';
import { client } from './api/clientInstance.ts';
import { closedLine } from './closedLine.ts';
import { ChatScreen } from './components/ChatScreen.tsx';
import { ConsentCard } from './components/ConsentCard.tsx';
import { NoticeStrip } from './components/NoticeStrip.tsx';
import { OverallQuestion } from './components/OverallQuestion.tsx';
import { SummaryCard } from './components/SummaryCard.tsx';
import { useSession } from './useSession.ts';

export function App() {
  const session = useSession(client);
  const { state } = session;
  const { consultation } = state;
  // Looking back at the thread from the summary is a client-only view: the server is already at the summary.
  const [lookingBack, setLookingBack] = useState(false);
  const requested = useRef(false);
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

  const onOverall = consultation !== null && state.phase === 'overall';
  const onSummary = consultation !== null && inSummary && !lookingBack;
  const onChat = consultation !== null && (state.phase === 'chat' || state.phase === 'unavailable' || (inSummary && lookingBack));
  const stepped = onOverall || onChat || onSummary;

  return (
    <div className="shell">
      <NoticeStrip
        line1={stepped ? consultation.title : 'Kopichat'}
        line2={onOverall ? 'Step 1 of 3' : onChat ? 'Step 2 of 3' : onSummary ? 'Step 3 of 3' : 'NUSSU consultation'}
        step={onOverall ? 1 : onChat ? 2 : onSummary ? 3 : undefined}
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
          !state.error && <p className="muted">Opening the consultation.</p>
        ) : state.phase === 'consent' ? (
          <ConsentCard consultation={consultation} busy={state.busy} onAgree={session.consent} />
        ) : state.phase === 'overall' ? (
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
        ) : state.phase === 'done' ? (
          <p className="body">{closedLine(consultation.closing_date)}</p>
        ) : (
          <p className="body">Phase: {state.phase}</p>
        )}
      </main>
    </div>
  );
}
