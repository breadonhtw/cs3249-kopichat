import type { Phase } from './api/client.ts';

export const DEFAULT_CHIPS = ['Skip this question', 'Why do you ask?', 'Pause'];
export const SUMMARY_CHIP = 'Check my summary';
export const DELETE_PROMPT_CHIPS = ['Delete', 'Keep draft'];
/** The last option of every "Did you mean" row, added by the server. Choosing it re-asks the question. */
export const NONE_OF_THESE = 'None of these';

/**
 * What choosing option `i` sends: the server's option action, never the label as typed text, so the reading is taken
 * as the answer (or, for "None of these", the question is asked again) instead of being read afresh by the model.
 * `bubble` says whether the choice shows in the thread as the student's words.
 */
export function optionRequest(label: string, i: number): { action: string; bubble: boolean } {
  return { action: `option:${i}`, bubble: label !== NONE_OF_THESE };
}

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
