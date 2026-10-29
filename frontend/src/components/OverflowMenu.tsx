import { useRef, useState } from 'react';

type Props = { busy: boolean; onAnonymous: () => void; onStop: () => void };

export function OverflowMenu({ busy, onAnonymous, onStop }: Props) {
  const menu = useRef<HTMLDetailsElement>(null);
  const [person, setPerson] = useState(false);

  function choose(action: () => void) {
    if (menu.current) menu.current.open = false;
    setPerson(false);
    action();
  }

  return (
    <details
      ref={menu}
      className="overflow"
      onToggle={(e) => {
        if (!e.currentTarget.open) setPerson(false);
      }}
    >
      <summary className="overflow__button" aria-label="More options">
        More
      </summary>
      <div className="overflow__panel">
        <button type="button" className="overflow__item" disabled={busy} onClick={() => choose(onAnonymous)}>
          Is this anonymous?
        </button>
        <button type="button" className="overflow__item" onClick={() => setPerson(true)}>
          Talk to a person
        </button>
        <button type="button" className="overflow__item" disabled={busy} onClick={() => choose(onStop)}>
          Stop and delete
        </button>
        {person && <p className="note overflow__note">For a person, contact the NUSSU consultation team at [contact].</p>}
      </div>
    </details>
  );
}
