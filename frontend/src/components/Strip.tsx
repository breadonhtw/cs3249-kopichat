import type { Strip as StripData, StripLine, StripSection } from '../api/client.ts';
import { countLine, drawnLine, groupFacts, repeatsOf, silentLine, splitQuote, tallyCaption, tallyRows } from '../reviewLines.ts';

function Line({ line, isNew, repeats }: { line: StripLine; isNew: boolean; repeats: string | undefined }) {
  const quote = line.quote ? splitQuote(line.quote) : null;
  const notes = [
    line.quote ? line.note : null,
    quote && quote.dates.length > 0
      ? `${quote.dates.length === 1 ? 'Date' : 'Dates'} worked out by the app: ${quote.dates.join(', ')}`
      : null,
    repeats ? `Same words as ${repeats}` : null,
  ].filter((n): n is string => n !== null);
  return (
    <li className={isNew ? 'said__line said__line--new' : 'said__line'}>
      <span className="said__who">{line.who}</span>
      <span className={quote ? 'said__quote' : 'said__quote said__quote--none'}>
        {quote ? `“${quote.words}”` : line.note}
        {notes.map((n) => <span key={n} className="said__note">{n}</span>)}
      </span>
    </li>
  );
}

function Section({ section, highlight }: { section: StripSection; highlight: string | null }) {
  const repeats = repeatsOf(section.said);
  // Nobody spoke to it: one line names who skipped it and who never said it, instead of a row of "not said".
  const silent = section.said.length > 0 && section.count.said === 0;
  return (
    <div className="strip__section">
      {section.label && <p className="strip__label">{section.label}</p>}
      <p className="strip__count">{countLine(section.count)}</p>
      {silent && <p className="strip__silent">{silentLine(section.said)}</p>}
      {!silent && section.said.length > 0 && (
        <ul className="said">
          {section.said.map((line) => (
            <Line key={line.who} line={line} isNew={line.who === highlight} repeats={repeats.get(line.who)} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * One group as a comic strip for a NUSSU reviewer. The head says what the group gave, part by part; the pictures
 * illustrate; the captions testify: every line is a stored quote with who said it and a count, set here from the
 * server's data, never by the image model.
 */
export function Strip({ strip, highlight = null, stale = false }: { strip: StripData; highlight?: string | null; stale?: boolean }) {
  const illustrated = strip.panels.some((p) => p.art !== null);
  // The marked account must really be in this strip before the page says it is.
  const marked = highlight !== null && strip.panels.some((p) => p.sections.some((s) => s.said.some((l) => l.who === highlight)));
  return (
    <article className={stale ? 'strip strip--stale' : 'strip'} aria-labelledby="strip-title" aria-busy={stale}>
      <header className="strip__head">
        <div className="strip__facts">
          <h2 id="strip-title" className="strip__title">{strip.group.name}</h2>
          <p className="strip__meta">{groupFacts(strip.group)}</p>
          {marked && <p className="strip__new">New: {highlight}. Its lines are marked.</p>}
          {!illustrated && <p className="strip__meta">No illustrations yet for this group. The captions are the record.</p>}
          <p className="strip__meta">{tallyCaption(strip.group.count)}</p>
          <ul className="tally" aria-label="Who in the group said something, part by part">
            {tallyRows(strip).map((row) => (
              <li key={row.label}>
                <a className="tally__row" href={`#${row.id}`}>
                  <span>{row.label}</span>
                  <span className="tally__figure">{row.figure}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
        {strip.cover && (
          <figure className="strip__cover">
            <img src={strip.cover.src} alt={strip.cover.alt} />
          </figure>
        )}
      </header>

      <ol className="strip__panels">
        {strip.panels.map((panel) => {
          // Illustrated panels say how many accounts the picture draws on: those quoted in it.
          const drawnFrom = panel.key === 'differing' ? 1 : panel.sections[0]?.count.said ?? 0;
          return (
            <li key={panel.key} id={`panel-${panel.key}`} className="strip__panel">
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
