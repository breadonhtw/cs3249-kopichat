import { chipRow, NONE_OF_THESE } from '../chips.ts';
import type { Phase } from '../api/client.ts';

type Props = {
  chips: string[];
  options: string[];
  transcriptLength: number;
  phase: Phase;
  busy: boolean;
  onChip: (label: string) => void;
  onOption: (index: number) => void;
};

export function ChipRow({ chips, options, transcriptLength, phase, busy, onChip, onOption }: Props) {
  const labels = chipRow(chips, options, transcriptLength, phase);
  if (labels.length === 0) return null;
  const choosing = options.length > 0;
  if (choosing) {
    return (
      <div className="options" role="group" aria-label="Did you mean">
        <p className="options__hint">Pick the closest, or type what you meant.</p>
        {labels.map((label, i) => (
          <button
            key={label}
            type="button"
            className={label === NONE_OF_THESE ? 'chip chip--none' : 'chip chip--option'}
            disabled={busy}
            onClick={() => onOption(i)}
          >
            {label}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="chips">
      {labels.map((label) => (
        <button key={label} type="button" className="chip" disabled={busy} onClick={() => onChip(label)}>
          {label}
        </button>
      ))}
    </div>
  );
}
