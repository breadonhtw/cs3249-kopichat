import { client } from './api/clientInstance.ts';
import { ChatScreen } from './components/ChatScreen.tsx';
import { ConsentCard } from './components/ConsentCard.tsx';
import { NoticeStrip } from './components/NoticeStrip.tsx';
import { OverallQuestion } from './components/OverallQuestion.tsx';
import { useSession } from './useSession.ts';

export function App() {
  const session = useSession(client);
  const { state } = session;
  const { consultation } = state;
  const onOverall = consultation !== null && state.phase === 'overall';
  const onChat = consultation !== null && (state.phase === 'chat' || state.phase === 'unavailable');
  const stepped = onOverall || onChat;

  return (
    <div className="shell">
      <NoticeStrip
        line1={stepped ? consultation.title : 'Kopichat'}
        line2={onOverall ? 'Step 1 of 3' : onChat ? 'Step 2 of 3' : 'NUSSU consultation'}
        step={onOverall ? 1 : onChat ? 2 : undefined}
        fictional
      />
      {state.error && (
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
        ) : onChat ? (
          <ChatScreen session={session} />
        ) : (
          <p className="body">Phase: {state.phase}</p>
        )}
      </main>
    </div>
  );
}
