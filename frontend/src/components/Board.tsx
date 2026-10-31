import { useEffect, useRef, type CSSProperties } from 'react';
import type { BoardLayout, Cell, Slip } from '../boardLayout.ts';
import { MOMENT, type MomentState } from '../motion.ts';
import { themeShort } from '../themeLabel.ts';

type Props = {
  layout: BoardLayout;
  state: MomentState;
  /** False shows the end state with no motion. */
  playing: boolean;
  /** The label beside the student's slip: the group name and lines under it, or the placement lines when there is no group. */
  label: { name?: string; lines: string[] };
};

function Pin() {
  return (
    <svg className="pin" viewBox="0 0 14 16" aria-hidden="true">
      <ellipse className="pin__shadow" cx="8.5" cy="13" rx="4.5" ry="2" />
      <circle className="pin__head" cx="7" cy="7" r="5.5" />
      <circle className="pin__shine" cx="5.2" cy="5.2" r="1.6" />
    </svg>
  );
}

function where(slip: Slip, layout: BoardLayout, state: MomentState): { cell: Cell; lifted: boolean; hidden: boolean; ms: number } {
  if (slip.kind === 'you') {
    // Before it is carried in, the student's slip waits below the board's clipped bottom edge.
    const cell = state.youIn ? slip.at : { col: 0 as const, row: layout.rows + 0.3 };
    return { cell, lifted: !state.youPressed, hidden: !state.youIn, ms: MOMENT.carryMs };
  }
  if (slip.kind === 'group') {
    const i = layout.movers.indexOf(slip.id);
    const ms = MOMENT.moveMs[Math.min(Math.max(i, 0), MOMENT.moveMs.length - 1)]!;
    return { cell: state.moved.includes(slip.id) ? slip.to : slip.at, lifted: state.lifted.includes(slip.id), hidden: false, ms };
  }
  return { cell: slip.at, lifted: false, hidden: false, ms: 0 };
}

/**
 * The receipt's noticeboard: the student's slip pinned among the others, the group gathered beside it. Motion is
 * transform and opacity only, set by `state`; each press dips the board a few pixels.
 */
export function Board({ layout, state, playing, label }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const presses = (state.youPressed ? 1 : 0) + state.pressed.length;
  const seen = useRef(presses);

  useEffect(() => {
    const el = ref.current;
    if (playing && presses > seen.current && el && typeof el.animate === 'function') {
      const px = presses === 1 ? 4 : 2;
      el.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${px}px)` }, { transform: 'translateY(0)' }],
        { duration: 220, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    }
    seen.current = presses;
  }, [presses, playing]);

  const framed = layout.cluster !== null;
  const labelOn = framed ? state.grouped : state.counted;
  const cellStyle = (c: Cell) => ({ '--col': c.col, '--row': c.row }) as CSSProperties;

  return (
    <div ref={ref} className="board" style={{ '--rows': layout.rows } as CSSProperties}>
      <ul className="board__slips">
        {layout.cluster && (
          <li
            aria-hidden="true"
            className={state.grouped ? 'board__cluster is-on' : 'board__cluster'}
            style={{ '--row': layout.cluster.row, '--span': layout.cluster.rows } as CSSProperties}
          />
        )}
        <li className={labelOn ? 'board__label is-on' : 'board__label'} style={cellStyle(layout.label)}>
          {label.name && <span className="board__name">{label.name}</span>}
          {label.lines.map((line) => (
            <span key={line} className="board__note">{line}</span>
          ))}
        </li>
        {layout.slips.map((slip) => {
          const at = where(slip, layout, state);
          const cls = ['slip', `slip--${slip.kind}`, at.lifted && 'is-lifted', at.hidden && 'is-hidden'].filter(Boolean).join(' ');
          const kept = slip.kind === 'differing' && state.kept;
          const style = { ...cellStyle(at.cell), '--tilt': `${slip.tilt}deg`, '--move': `${at.ms}ms` } as CSSProperties;
          return (
            <li key={slip.id} className={cls} style={style}>
              <Pin />
              <span className="slip__theme">{kept ? 'kept as a differing experience' : themeShort(slip.theme)}</span>
              <span className="slip__text">{slip.text}</span>
              {slip.kind === 'you' && <span className="slip__pill">you</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
