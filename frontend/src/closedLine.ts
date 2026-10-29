/** The line shown once the student closes the consultation. A missing or placeholder date ("[...]") drops the withdraw clause. */
export function closedLine(closingDate: string | undefined | null): string {
  const date = closingDate?.trim();
  if (!date || date.startsWith('[')) return 'This consultation link has been used.';
  return `This consultation link has been used. Withdraw before ${date}.`;
}
