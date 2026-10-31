/** Where each slip sits on the receipt's noticeboard, before and after the group gathers. Two columns, rows of equal height. */

export const BOARD_SLIPS_MAX = 8;
/** Group slips carried over to the student's; the rest of the group is counted in the label. */
export const GROUP_SHOWN_MAX = 2;

export type Cell = { col: 0 | 1; row: number };
export type SlipKind = 'you' | 'group' | 'differing' | 'other';
export type Slip = { id: string; kind: SlipKind; theme: string; text: string; at: Cell; to: Cell; tilt: number };

export type BoardInput = {
  you: { text: string; theme: string };
  /** The account sits in a group a reviewer can check (named or pending), not waiting for review. */
  grouped: boolean;
  group: { id: string; excerpt: string }[];
  differing: { id: string; excerpt: string; theme?: string }[];
  others: { id: string; excerpt: string; theme: string }[];
  contributors: number;
};

export type BoardLayout = {
  slips: Slip[];
  rows: number;
  /** The frame round the student's group: its first row and how many rows it spans. */
  cluster: { row: number; rows: number } | null;
  /** The cell that holds the group label, or the placement lines when there is no group. */
  label: Cell;
  /** Group slips in the order they are carried: the lowest first, so neither passes the other. */
  movers: string[];
  /** Accounts in the consultation that have no slip on the board. */
  hidden: number;
};

/** A small, fixed tilt per slip, from its id: between -1.2 and 1.2 degrees. */
function tiltOf(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.round(((Math.abs(h) % 25) / 10 - 1.2) * 10) / 10;
}

/**
 * The student's slip goes in the left column under everything else. Group slips start in the right column and are
 * carried straight down it to the cells beside the student's slip, so a moving slip never passes over it. Differing
 * accounts and other themes fill the remaining cells in reading order, differing first.
 */
export function layoutBoard(input: BoardInput): BoardLayout {
  const group = input.grouped ? input.group.slice(0, GROUP_SHOWN_MAX) : [];
  const room = BOARD_SLIPS_MAX - 1 - group.length;
  const stays = [
    ...input.differing.map((d) => ({ id: d.id, kind: 'differing' as const, text: d.excerpt, theme: d.theme ?? '' })),
    ...input.others.map((o) => ({ id: o.id, kind: 'other' as const, text: o.excerpt, theme: o.theme })),
  ].slice(0, room);

  const m = group.length;
  const above = Math.max(Math.ceil((stays.length + m) / 2), m);
  const moverRows = m === 2 ? [0, above - 1] : m === 1 ? [0] : [];

  const free: Cell[] = [];
  for (let row = 0; row < above; row++) {
    for (const col of [0, 1] as const) if (!(col === 1 && moverRows.includes(row))) free.push({ col, row });
  }

  const slips: Slip[] = stays.map((s, i) => ({ ...s, at: free[i]!, to: free[i]!, tilt: tiltOf(s.id) }));
  const starts = group.map((g, i) => ({ g, at: { col: 1 as const, row: moverRows[i]! } }));
  const order = [...starts].sort((a, b) => b.at.row - a.at.row);
  order.forEach(({ g, at }, i) => {
    const to: Cell = { col: 1, row: above + (m === 2 && i === 0 ? 1 : 0) };
    slips.push({ id: g.id, kind: 'group', theme: input.you.theme, text: g.excerpt, at, to, tilt: tiltOf(g.id) });
  });
  const you: Cell = { col: 0, row: above };
  slips.push({ id: 'you', kind: 'you', theme: input.you.theme, text: input.you.text, at: you, to: you, tilt: -0.6 });

  const cluster = input.grouped ? { row: above, rows: m === 0 ? 1 : 2 } : null;
  const label: Cell = input.grouped && m > 0 ? { col: 0, row: above + 1 } : { col: 1, row: above };
  return {
    slips,
    rows: above + (cluster?.rows ?? 1),
    cluster,
    label,
    movers: order.map(({ g }) => g.id),
    hidden: Math.max(0, input.contributors - slips.length),
  };
}
