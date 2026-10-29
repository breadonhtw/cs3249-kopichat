import { useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';

type Props = {
  busy: boolean;
  /** Returns true when the text was sent. The field clears only then. */
  onSend: (text: string) => boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
};

export function Composer({ busy, onSend, inputRef }: Props) {
  const [text, setText] = useState('');

  // Grow with the text; the stylesheet caps the height at three lines and the field scrolls after that.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text, inputRef]);

  function submit() {
    if (text.trim() === '') return;
    if (onSend(text.trim())) setText('');
  }

  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        ref={inputRef}
        className="composer__input"
        aria-label="Your answer"
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <button type="submit" className="composer__send" aria-label="Send" disabled={busy || text.trim() === ''}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path d="M9 14.5V3.5M4 8.5 9 3.5l5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </form>
  );
}
