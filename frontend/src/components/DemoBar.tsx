import { DEMO_LINES } from '../demoScript.ts';
import type { Phase } from '../api/client.ts';

type Props = {
  phase: Phase;
  busy: boolean;
  /** Resets the seeds on the server and reloads the session. */
  onRestart: () => void;
  /** Sends one student line as a typed message. */
  onSend: (text: string) => void;
};

/** The presenter's demo controls: restart, and the five storyboard lines as one-press messages. Rendered in dev at laptop width only. */
export function DemoBar({ phase, busy, onRestart, onSend }: Props) {
  const canSend = phase === 'chat' && !busy;
  return (
    <div className="demobar" role="group" aria-label="Demo controls">
      <button type="button" className="demobar__btn" disabled={busy} onClick={onRestart}>
        Restart demo
      </button>
      {DEMO_LINES.map((text, i) => (
        <button key={i} type="button" className="demobar__btn" disabled={!canSend} title={text} onClick={() => onSend(text)}>
          Line {i + 1}
        </button>
      ))}
    </div>
  );
}
