import { client } from './api/clientInstance.ts';
import { ConsentCard } from './components/ConsentCard.tsx';
import { NoticeStrip } from './components/NoticeStrip.tsx';
import { OverallQuestion } from './components/OverallQuestion.tsx';
import { useSession } from './useSession.ts';

export function App() {
  const session = useSession(client);
  const { state } = session;
  const { consultation } = state;
  const onOverall = consultation !== null && state.phase === 'overall';

  return (
    <div className="shell">
      <NoticeStrip
        line1={onOverall ? consultation.title : 'Kopichat'}
        line2={onOverall ? 'Step 1 of 3' : 'NUSSU consultation'}
        step={onOverall ? 1 : undefined}
        fictional
      />
      {state.error && (
        <p className="muted" role="alert">
          {state.error}
        </p>
      )}
      <main className="main">
        {consultation === null ? (
          !state.error && <p className="muted">Opening the consultation.</p>
        ) : state.phase === 'consent' ? (
          <ConsentCard consultation={consultation} busy={state.busy} onAgree={session.consent} />
        ) : state.phase === 'overall' ? (
          <OverallQuestion consultation={consultation} busy={state.busy} onAnswer={session.overall} />
        ) : (
          <p className="body">Phase: {state.phase}</p>
        )}
      </main>
    </div>
  );
}
