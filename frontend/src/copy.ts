/** The four consent rows, shared by the consent card and the receipt's data notice. */
export function consentRows(why: string): { title: string; body: string }[] {
  return [
    { title: 'Why NUSSU is asking', body: why },
    {
      title: 'Who can see your responses',
      body: 'The NUSSU consultation team sees your approved summary and your replies. No name or student ID is collected.',
    },
    {
      title: 'How findings are used',
      body: 'Approved accounts are grouped into themes, reviewed by NUSSU, and summarised in a public consultation update. Only approved material is used.',
    },
    {
      title: 'Stopping at any point',
      body: 'You can skip any question, pause, or stop and delete what you typed before approving. Nothing is sent until you approve.',
    },
  ];
}
