import type { Aggregate } from './api/client.ts';

/** The beats of the submission moment, as [start, end] in milliseconds. Total 4.5 s; the closing line is the last thing to appear. */
export const BEATS = { stamp: [0, 400], writeIn: [400, 2000], bracket: [2000, 3200], kept: [3200, 4200], closing: [4200, 4500] } as const;

export type BeatName = keyof typeof BEATS;
export type Beat = { name: BeatName; at: number; duration: number };

const ORDER: BeatName[] = ['stamp', 'writeIn', 'bracket', 'kept', 'closing'];
const FRAME_MS = 1000 / 60;

export function reducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The beats to play, in order. With reduced motion every beat is zero-length at 0, so the end state shows at once.
 * With no group there is nothing to bracket: that beat is dropped and the later beats start that much earlier.
 */
export function planBeats(aggregate: Aggregate, reduced: boolean): Beat[] {
  const bracketed = aggregate.group.name !== null;
  const names = ORDER.filter((name) => bracketed || name !== 'bracket');
  return names.map((name) => {
    if (reduced) return { name, at: 0, duration: 0 };
    const [start, end] = BEATS[name];
    const skipped = bracketed ? 0 : BEATS.bracket[1] - BEATS.bracket[0];
    const at = name === 'kept' || name === 'closing' ? start - skipped : start;
    return { name, at, duration: end - start };
  });
}

/** Integer values for the counter tick, one per display frame, easing out. First is `from`, last is `to`, length at least 2. */
export function countFrames(from: number, to: number, durationMs: number): number[] {
  const steps = Math.max(1, Math.round(Math.max(0, durationMs) / FRAME_MS));
  const frames: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const eased = 1 - Math.pow(1 - t, 3);
    frames.push(i === steps ? to : Math.round(from + (to - from) * eased));
  }
  return frames;
}

/** The counter's value at `elapsedMs` into the tick: never before the first frame (a negative elapsed) or after the last. */
export function frameAt(frames: number[], elapsedMs: number, durationMs: number): number {
  const last = frames.length - 1;
  if (last < 0) return 0;
  const t = durationMs > 0 ? Math.min(1, Math.max(0, elapsedMs / durationMs)) : 1;
  return frames[Math.min(last, Math.max(0, Math.floor(t * last)))]!;
}
