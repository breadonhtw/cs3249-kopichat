import { useCallback, useSyncExternalStore } from 'react';

const canMatch = () => typeof window !== 'undefined' && !!window.matchMedia;

/** True while the viewport is at least `px` wide. Read from matchMedia, so a component can choose not to render at all below it. */
export function useMinWidth(px: number): boolean {
  const query = `(min-width: ${px}px)`;
  // Stable per query, so the store is not resubscribed on every render.
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!canMatch()) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', notify);
      return () => list.removeEventListener('change', notify);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => canMatch() && window.matchMedia(query).matches,
    () => false,
  );
}
