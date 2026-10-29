import { chipRow } from '../chips.ts';
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
  return (
    <div className="chips">
      {labels.map((label, i) => (
        <button
          key={label}
          type="button"
          className="chip"
          disabled={busy}
          onClick={() => (choosing ? onOption(i) : onChip(label))}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
