import { useSyncExternalStore } from 'react';

/** True while the viewport is at least `px` wide. Read from matchMedia, so a component can choose not to render at all below it. */
export function useMinWidth(px: number): boolean {
  const query = `(min-width: ${px}px)`;
  return useSyncExternalStore(
    (notify) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', notify);
      return () => list.removeEventListener('change', notify);
    },
    () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches,
    () => false,
  );
}
