const LABELS: Record<string, string> = {
  transport: 'Transport access and crowding',
  food: 'Food-court access and congestion',
  study: 'Disruption of study and teaching',
  access: 'Accessibility and physical obstruction',
  privacy: 'Privacy and personal boundaries',
  seats: 'Finding a seat',
  hours: 'Opening hours and access',
  conditions: 'Conditions in the space',
  other: 'Other',
  needs_review: 'Needs review',
};

/** The words for a theme key. A key this screen does not know reads as "Other". */
export function themeLabel(key: string): string {
  return Object.hasOwn(LABELS, key) ? LABELS[key]! : 'Other';
}

const SHORT: Record<string, string> = {
  transport: 'Transport',
  food: 'Food court',
  study: 'Study and teaching',
  access: 'Accessibility',
  privacy: 'Privacy',
  seats: 'Seats',
  hours: 'Opening hours',
  conditions: 'Conditions',
  other: 'Other',
  needs_review: 'Needs review',
};

/** The theme as a slip on the noticeboard names it: one or two words. */
export function themeShort(key: string): string {
  return Object.hasOwn(SHORT, key) ? SHORT[key]! : 'Other';
}
