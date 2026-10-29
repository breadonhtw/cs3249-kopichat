const LABELS: Record<string, string> = {
  transport: 'Transport access and crowding',
  food: 'Food-court access and congestion',
  study: 'Disruption of study and teaching',
  access: 'Accessibility and physical obstruction',
  privacy: 'Privacy and personal boundaries',
  other: 'Other',
  needs_review: 'Needs review',
};

/** The words for a theme key. A key this screen does not know reads as "Other". */
export function themeLabel(key: string): string {
  return Object.hasOwn(LABELS, key) ? LABELS[key]! : 'Other';
}
