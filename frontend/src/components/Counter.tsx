import { useEffect, useState } from 'react';
import { countFrames, frameAt } from '../motion.ts';

const TICK_MS = 600;

type Props = { from: number; to: number; play: boolean };

/** "{N} contributors" in tabular figures. While `play` it ticks from `from` to `to` over 600 ms; otherwise it shows `to`. Teal once it has landed above `from`. */
export function Counter({ from, to, play }: Props) {
  const [value, setValue] = useState(play ? from : to);
  const [landed, setLanded] = useState(!play && to > from);

  useEffect(() => {
    if (!play) {
      setValue(to);
      setLanded(to > from);
      return;
    }
    setValue(from);
    setLanded(false);
    const frames = countFrames(from, to, TICK_MS);
    // The clock starts at the first frame's own timestamp, so elapsed is never negative.
    let start: number | null = null;
    let raf = 0;
    const step = (now: number) => {
      start ??= now;
      const elapsed = now - start;
      setValue(frameAt(frames, elapsed, TICK_MS));
      if (elapsed < TICK_MS) raf = requestAnimationFrame(step);
      else setLanded(to > from);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [from, to, play]);

  const word = to === 1 ? 'contributor' : 'contributors';
  return (
    <p className={landed ? 'counter counter--landed' : 'counter'}>
      <span className="visually-hidden">{`${to} ${word}`}</span>
      <span aria-hidden="true">
        <span className="counter__num">{value}</span> {word}
      </span>
    </p>
  );
}
