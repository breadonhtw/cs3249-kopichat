/** The matched form's draft: what the student has typed, kept in this tab until they submit or delete it. Pure helpers. */
import type { FormField, FormSubmission, SummaryRow } from './api/client.ts';

export type FormStage = 'consent' | 'overall' | 'fields' | 'review';

export type FormDraft = {
  stage: FormStage;
  overall: string | null;
  /** By dimension (q1_what …), as typed. A missing or blank entry is a question left empty. */
  answers: Record<string, string>;
  /** Dimensions changed on the review page. */
  edited: string[];
};

export const EMPTY_DRAFT: FormDraft = { stage: 'consent', overall: null, answers: {}, edited: [] };

const STAGES: FormStage[] = ['consent', 'overall', 'fields', 'review'];

export function draftKey(sessionId: string): string {
  return `kopichat.formdraft.${sessionId}`;
}

/** A stored draft read back; anything malformed is an empty draft. */
export function parseDraft(raw: string | null | undefined): FormDraft {
  if (!raw) return EMPTY_DRAFT;
  try {
    const d = JSON.parse(raw) as Partial<FormDraft>;
    if (typeof d !== 'object' || d === null || !STAGES.includes(d.stage as FormStage)) return EMPTY_DRAFT;
    const answers: Record<string, string> = {};
    for (const [dim, text] of Object.entries(d.answers ?? {})) if (typeof text === 'string') answers[dim] = text;
    return {
      stage: d.stage as FormStage,
      overall: typeof d.overall === 'string' ? d.overall : null,
      answers,
      edited: Array.isArray(d.edited) ? d.edited.filter((x): x is string => typeof x === 'string') : [],
    };
  } catch {
    return EMPTY_DRAFT;
  }
}

/** True once at least one of the questions has an answer: the least a submission can hold. */
export function hasAnswer(draft: FormDraft, fields: FormField[]): boolean {
  return fields.some((f) => (draft.answers[f.dim] ?? '').trim() !== '');
}

/** The draft as the review page shows it: the overall view, then every question in order, empty ones as skipped. */
export function reviewRows(draft: FormDraft, fields: FormField[]): SummaryRow[] {
  const rows: SummaryRow[] = [
    { key: 'overall', label: 'Overall view', text: draft.overall ?? 'Skipped', status: draft.overall ? 'quoted' : 'skipped' },
  ];
  for (const f of fields) {
    const text = (draft.answers[f.dim] ?? '').trim();
    const status = text === '' ? 'skipped' : draft.edited.includes(f.dim) ? 'edited' : 'quoted';
    rows.push({ key: f.dim, label: f.label, text, status });
  }
  return rows;
}

/** An answer changed on the review page. Saving the same words again is not an edit. */
export function withReviewEdit(draft: FormDraft, dim: string, text: string): FormDraft {
  const next = text.trim();
  if (next === (draft.answers[dim] ?? '').trim()) return draft;
  return {
    ...draft,
    answers: { ...draft.answers, [dim]: next },
    edited: draft.edited.includes(dim) ? draft.edited : [...draft.edited, dim],
  };
}

/** What is sent on Submit: trimmed answers, empty ones left out. */
export function toSubmission(draft: FormDraft, fields: FormField[]): FormSubmission {
  const answers: Record<string, string> = {};
  for (const f of fields) {
    const text = (draft.answers[f.dim] ?? '').trim();
    if (text !== '') answers[f.dim] = text;
  }
  return { overall: draft.overall, answers, edited: draft.edited.filter((dim) => dim in answers) };
}
