import type { SessionState } from './useSession.ts';

export type Screen = 'consent' | 'overall' | 'chat' | 'summary' | 'receipt' | 'withdrawn' | 'deleted' | 'done' | 'error' | 'loading';

/** The one screen the student sees for a session state. `lookingBack` is the client-only view of the thread from the summary. */
export function screenFor(state: Pick<SessionState, 'phase' | 'consultation' | 'account' | 'error'>, lookingBack = false): Screen {
  if (state.consultation === null) return state.error ? 'error' : 'loading';
  switch (state.phase) {
    case 'consent':
      return 'consent';
    case 'overall':
      return 'overall';
    case 'chat':
    case 'unavailable':
      return 'chat';
    case 'summary':
      return lookingBack ? 'chat' : 'summary';
    case 'receipt':
      return 'receipt';
    case 'deleted':
      // A withdrawal keeps the receipt up to say so; a deleted draft has no receipt.
      return state.account !== null ? 'withdrawn' : 'deleted';
    case 'done':
      return 'done';
  }
  return 'error';
}
