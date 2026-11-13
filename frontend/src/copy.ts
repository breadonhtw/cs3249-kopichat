/** Chat or form: the two ways of taking part that the user study compares. Their notices differ only where the
 * same sentence would be untrue of one of them (an AI reads the chat; the form has no summary and no noticeboard). */
export type Channel = 'chat' | 'form';

/** Said on the consent screen of both, in the same words. Matches INVITATION in backend/content.py. */
export const INVITATION = 'Good, bad, no-effect and not-sure experiences are all welcome.';

/** The four consent rows, shared by the consent card and the receipt's data notice. With a closing date, the stopping
 * row also says until when a sent account can be withdrawn. */
export function consentRows(why: string, closingDate?: string | null, channel: Channel = 'chat'): { title: string; body: string }[] {
  const date = closingDate?.trim();
  const withdraw = !date || date.startsWith('[') ? 'before the consultation closes' : `before ${date}`;
  if (channel === 'form') {
    return [
      { title: 'Why NUSSU is asking', body: why },
      {
        title: 'Who can see your responses',
        body: 'The NUSSU consultation team sees the answers you submit. No name or student ID is collected.',
      },
      {
        title: 'How findings are used',
        body: 'Approved accounts are grouped into themes, reviewed by NUSSU, and summarised in a public consultation update. Only approved material is used.',
      },
      {
        title: 'Stopping and withdrawing',
        body: `You can leave any question empty, or stop and delete what you typed before submitting. Nothing is sent until you submit. After sending, you can withdraw your account ${withdraw}.`,
      },
    ];
  }
  return [
    { title: 'Why NUSSU is asking', body: why },
    {
      title: 'Who can see your responses',
      body: 'The NUSSU consultation team sees your approved summary and your replies. Other students see a line of it only if you choose the noticeboard before sending. No name or student ID is collected.',
    },
    {
      title: 'How findings are used',
      body: 'Approved accounts are grouped into themes, reviewed by NUSSU, and summarised in a public consultation update. Only approved material is used.',
    },
    {
      title: 'Stopping and withdrawing',
      body: `You can skip any question, pause, or stop and delete what you typed before approving. Nothing is sent until you approve. After sending, you can withdraw your account ${withdraw}.`,
    },
  ];
}
