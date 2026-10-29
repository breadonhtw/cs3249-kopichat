import type { KeyboardEvent } from 'react';

type KeyLike = Pick<KeyboardEvent, 'key' | 'shiftKey' | 'keyCode'> & { nativeEvent: { isComposing: boolean } };

/** Enter sends. Shift+Enter is a newline, and Enter that confirms an IME candidate (composing, or keyCode 229) is not a send. */
export function shouldSend(e: KeyLike): boolean {
  return e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229;
}
