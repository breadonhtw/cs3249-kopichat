import { useEffect, useState } from 'react';
import { countFrames } from '../motion.ts';

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
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / TICK_MS);
      setValue(frames[Math.min(frames.length - 1, Math.floor(t * (frames.length - 1)))]!);
      if (t < 1) raf = requestAnimationFrame(step);
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
