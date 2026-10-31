const FRAME_MS = 1000 / 60;

export function reducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** One step of the submission moment, at `at` ms. `move` carries its travel time in `ms`. */
export type MomentEvent = {
  at: number;
  kind: 'stamp' | 'carryIn' | 'pressIn' | 'count' | 'lift' | 'move' | 'press' | 'group' | 'kept' | 'closing';
  id?: string;
  ms?: number;
};

/** What the board shows at a point in the moment. `lifted`, `moved` and `pressed` hold group slip ids. */
export type MomentState = {
  stamped: boolean; youIn: boolean; youPressed: boolean; counted: boolean;
  lifted: string[]; moved: string[]; pressed: string[];
  grouped: boolean; kept: boolean; closed: boolean;
};

export const MOMENT_START: MomentState = {
  stamped: false, youIn: false, youPressed: false, counted: false,
  lifted: [], moved: [], pressed: [], grouped: false, kept: false, closed: false,
};

/** Times in ms. The student's slip is carried in for 900 ms; each group slip after it is lifted, carried, pressed. */
export const MOMENT = { stamp: 40, carryIn: 250, carryMs: 900, pressIn: 1200, count: 1500, gather: 1800, gap: 600, liftLead: 150, moveMs: [800, 1000] } as const;

export function momentEnd(movers: string[]): MomentState {
  return { stamped: true, youIn: true, youPressed: true, counted: true, lifted: [], moved: [...movers], pressed: [...movers],
    grouped: true, kept: true, closed: true };
}

/**
 * The events of the moment, in time order. With a group of three it ends at 4.35 s: stamp, the student's slip carried
 * in and pressed, the count, the two group slips carried over one after the other, the frame, kept, the closing line.
 */
export function momentTimeline(movers: string[], { grouped, kept }: { grouped: boolean; kept: boolean }): MomentEvent[] {
  const events: MomentEvent[] = [
    { at: MOMENT.stamp, kind: 'stamp' },
    { at: MOMENT.carryIn, kind: 'carryIn', ms: MOMENT.carryMs },
    { at: MOMENT.pressIn, kind: 'pressIn' },
    { at: MOMENT.count, kind: 'count' },
  ];
  let after: number = MOMENT.count;
  movers.forEach((id, i) => {
    const lift = MOMENT.gather + i * MOMENT.gap;
    const ms = MOMENT.moveMs[Math.min(i, MOMENT.moveMs.length - 1)]!;
    events.push({ at: lift, kind: 'lift', id }, { at: lift + MOMENT.liftLead, kind: 'move', id, ms },
      { at: lift + MOMENT.liftLead + ms, kind: 'press', id });
    after = Math.max(after, lift + MOMENT.liftLead + ms);
  });
  if (grouped) events.push({ at: (after += 200), kind: 'group' });
  if (kept) events.push({ at: (after += 300), kind: 'kept' });
  events.push({ at: after + 300, kind: 'closing' });
  // Stable sort: events at the same time keep the order they were pushed in.
  return events.map((e, i) => ({ e, i })).sort((a, b) => a.e.at - b.e.at || a.i - b.i).map(({ e }) => e);
}

export function applyEvent(state: MomentState, e: MomentEvent): MomentState {
  const id = e.id ?? '';
  switch (e.kind) {
    case 'stamp': return { ...state, stamped: true };
    case 'carryIn': return { ...state, youIn: true };
    case 'pressIn': return { ...state, youPressed: true };
    case 'count': return { ...state, counted: true };
    case 'lift': return { ...state, lifted: [...state.lifted, id] };
    case 'move': return { ...state, moved: [...state.moved, id] };
    case 'press': return { ...state, lifted: state.lifted.filter((x) => x !== id), pressed: [...state.pressed, id] };
    case 'group': return { ...state, grouped: true };
    case 'kept': return { ...state, kept: true };
    case 'closing': return { ...state, closed: true };
  }
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
