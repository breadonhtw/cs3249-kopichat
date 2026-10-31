import type { Strip as StripData, StripLine, StripSection } from '../api/client.ts';
import { countLine, drawnLine, groupFacts } from '../reviewLines.ts';

function Line({ line, isNew }: { line: StripLine; isNew: boolean }) {
  return (
    <li className={isNew ? 'said__line said__line--new' : 'said__line'}>
      <span className="said__who">{line.who}</span>
      <span className={line.quote ? 'said__quote' : 'said__quote said__quote--none'}>
        {line.quote ? `“${line.quote}”` : line.note}
        {line.quote && line.note && <span className="said__note">{line.note}</span>}
      </span>
    </li>
  );
}

function Section({ section, highlight }: { section: StripSection; highlight: string | null }) {
  return (
    <div className="strip__section">
      {section.label && <p className="strip__label">{section.label}</p>}
      <p className="strip__count">{countLine(section.count)}</p>
      {section.said.length > 0 && (
        <ul className="said">
          {section.said.map((line) => <Line key={line.who} line={line} isNew={line.who === highlight} />)}
        </ul>
      )}
    </div>
  );
}

/**
 * One group as a comic strip for a NUSSU reviewer. The pictures illustrate; the captions testify: every line is a
 * stored quote with who said it and a count, set here from the server's data, never by the image model.
 */
export function Strip({ strip, highlight = null }: { strip: StripData; highlight?: string | null }) {
  const illustrated = strip.panels.some((p) => p.art !== null);
  // The marked account must really be in this strip before the page says it is.
  const marked = highlight !== null && strip.panels.some((p) => p.sections.some((s) => s.said.some((l) => l.who === highlight)));
  return (
    <article className="strip" aria-labelledby="strip-title">
      <header className="strip__head">
        {strip.cover && (
          <figure className="strip__cover">
            <img src={strip.cover.src} alt={strip.cover.alt} />
          </figure>
        )}
        <div className="strip__facts">
          <h2 id="strip-title" className="strip__title">{strip.group.name}</h2>
          <p className="strip__meta">{groupFacts(strip.group)}</p>
          {marked && <p className="strip__new">New: {highlight}. Its lines are marked.</p>}
          {!illustrated && <p className="strip__meta">No illustrations yet for this group. The captions are the record.</p>}
        </div>
      </header>

      <ol className="strip__panels">
        {strip.panels.map((panel) => {
          // Illustrated panels say how many accounts the picture draws on: those quoted in it.
          const drawnFrom = panel.key === 'differing' ? 1 : panel.sections[0]?.count.said ?? 0;
          return (
            <li key={panel.key} className="strip__panel">
              <h3 className="strip__panel-title">{panel.title}</h3>
              {panel.art && (
                <figure className="strip__frame">
                  <img src={panel.art.src} alt={panel.art.alt} loading="lazy" />
                  <figcaption className="strip__drawn">{drawnLine(drawnFrom)}</figcaption>
                </figure>
              )}
              {panel.key === 'read' && (
                <p className="strip__drawn">Not drawn: a picture would state a cause the accounts only suspect.</p>
              )}
              {panel.sections.map((section, i) => (
                <Section key={section.label ?? i} section={section} highlight={marked ? highlight : null} />
              ))}
            </li>
          );
        })}
      </ol>
    </article>
  );
}
