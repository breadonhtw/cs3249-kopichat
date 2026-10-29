import type { Phase } from './api/client.ts';

export const DEFAULT_CHIPS = ['Skip this question', 'Why do you ask?', 'Pause'];
export const SUMMARY_CHIP = 'Check my summary';
export const DELETE_PROMPT_CHIPS = ['Delete', 'Keep draft'];

/** True when the server is asking the student to confirm stopping: the composer gives way to a confirmation. */
export function isDeletePrompt(chips: string[]): boolean {
  return chips.length === DELETE_PROMPT_CHIPS.length && DELETE_PROMPT_CHIPS.every((c, i) => chips[i] === c);
}

/**
 * The labels shown in the chip row. Options (an unclear turn) replace the chips until the next turn.
 * Otherwise the server's chips, plus "Check my summary" once at least one answer is on record.
 */
export function chipRow(serverChips: string[], options: string[], transcriptLength: number, phase: Phase): string[] {
  if (options.length > 0) return options;
  if (serverChips.length === 0 || isDeletePrompt(serverChips)) return serverChips;
  const inChat = phase === 'chat' || phase === 'unavailable';
  if (inChat && transcriptLength > 0 && !serverChips.includes(SUMMARY_CHIP)) return [...serverChips, SUMMARY_CHIP];
  return serverChips;
}
