type Props = { line1: string; line2: string; step?: 1 | 2 | 3; fictional?: boolean };

export function NoticeStrip({ line1, line2, step, fictional }: Props) {
  return (
    <header className="strip">
      <div className="strip__top">
        <p className="strip__line1">{line1}</p>
        {fictional && <p className="strip__fictional">Fictional example</p>}
      </div>
      <p className="strip__line2">{line2}</p>
      <div className="strip__bar" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <span key={n} className={n <= (step ?? 0) ? 'strip__seg strip__seg--on' : 'strip__seg'} />
        ))}
      </div>
    </header>
  );
}
