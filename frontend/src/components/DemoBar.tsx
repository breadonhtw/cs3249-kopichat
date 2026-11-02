import { DEMO_LINES, RED_TEAM_LINES } from '../demoScript.ts';
import type { Phase } from '../api/client.ts';
import { reviewHref } from '../reviewLines.ts';

type Props = {
  phase: Phase;
  busy: boolean;
  /** Resets the seeds on the server and reloads the session. */
  onRestart: () => void;
  /** Sends one student line as a typed message. */
  onSend: (text: string) => void;
  /** The sent account's reference, once there is a receipt: the jump to NUSSU's side. */
  reviewRef: string | null;
};

/**
 * The presenter's demo controls: restart, the five storyboard lines as one-press messages, the red-team lines for Q&A,
 * and after sending, a link to NUSSU's side in a new tab. Rendered in dev at laptop width only; a student never sees the
 * reviewer view.
 */
export function DemoBar({ phase, busy, onRestart, onSend, reviewRef }: Props) {
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
      <span className="demobar__group" role="group" aria-label="Red team">
        <span className="demobar__label">Red team</span>
        {RED_TEAM_LINES.map((line) => (
          <button
            key={line.label}
            type="button"
            className="demobar__btn demobar__btn--red"
            disabled={!canSend}
            title={`${line.text}\n\nExpect: ${line.expect}`}
            onClick={() => onSend(line.text)}
          >
            {line.label}
          </button>
        ))}
      </span>
      {reviewRef && (
        <a className="demobar__btn demobar__link" href={reviewHref(reviewRef)} target="_blank" rel="noopener" title="Or press n">
          See it on NUSSU's side
        </a>
      )}
    </div>
  );
}
