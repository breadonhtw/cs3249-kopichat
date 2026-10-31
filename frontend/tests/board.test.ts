import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutBoard, BOARD_SLIPS_MAX, type BoardInput } from '../src/boardLayout.ts';
import { momentTimeline, momentEnd, applyEvent, MOMENT_START } from '../src/motion.ts';

const demo: BoardInput = {
  you: { text: "Couldn't get onto the first A2", theme: 'transport' },
  grouped: true,
  group: [{ id: 'A', excerpt: "Couldn't board two A2s" }, { id: 'B', excerpt: 'Full A2 at about 9am' }],
  differing: [{ id: 'C', excerpt: 'D2 at UTown', theme: 'transport' }, { id: 'D', excerpt: 'Student guide', theme: 'transport' }],
  others: [{ id: 'E', excerpt: 'Frontier queue', theme: 'food' }, { id: 'F', excerpt: 'Visitors photographing', theme: 'study' }],
  contributors: 7,
};

const cell = (layout: ReturnType<typeof layoutBoard>, id: string, which: 'at' | 'to') => {
  const s = layout.slips.find((x) => x.id === id)!;
  return [s[which].col, s[which].row];
};

test('the demo board matches the mock: group slips in the right column, the rest in reading order', () => {
  const l = layoutBoard(demo);
  assert.deepEqual(cell(l, 'A', 'at'), [1, 0]);
  assert.deepEqual(cell(l, 'B', 'at'), [1, 2]);
  assert.deepEqual(['C', 'D', 'E', 'F'].map((id) => cell(l, id, 'at')), [[0, 0], [0, 1], [1, 1], [0, 2]]);
  assert.deepEqual(cell(l, 'you', 'at'), [0, 3]);
});

test('the group gathers beside and below the student, lowest slip first', () => {
  const l = layoutBoard(demo);
  assert.deepEqual(l.movers, ['B', 'A']);
  assert.deepEqual(cell(l, 'B', 'to'), [1, 4]);
  assert.deepEqual(cell(l, 'A', 'to'), [1, 3]);
  assert.deepEqual(l.cluster, { row: 3, rows: 2 });
  assert.deepEqual(l.label, { col: 0, row: 4 });
  assert.equal(l.rows, 5);
  assert.equal(l.hidden, 0);
});

test('slips that do not move end where they start', () => {
  const l = layoutBoard(demo);
  for (const s of l.slips.filter((x) => !l.movers.includes(x.id))) assert.deepEqual(s.to, s.at);
});

test('no two slips share a cell, before or after', () => {
  for (const which of ['at', 'to'] as const) {
    const cells = layoutBoard(demo).slips.map((s) => `${s[which].col},${s[which].row}`);
    assert.equal(new Set(cells).size, cells.length);
  }
});

test('a moving slip never crosses the student: movers start and end in the right column', () => {
  const l = layoutBoard(demo);
  for (const id of l.movers) {
    assert.equal(cell(l, id, 'at')[0], 1);
    assert.equal(cell(l, id, 'to')[0], 1);
  }
});

test('first contributor with no group: the student alone, the placement beside it, no frame', () => {
  const l = layoutBoard({ ...demo, grouped: false, group: [], differing: [], others: [], contributors: 1 });
  assert.deepEqual(cell(l, 'you', 'at'), [0, 0]);
  assert.equal(l.cluster, null);
  assert.deepEqual(l.label, { col: 1, row: 0 });
  assert.deepEqual(l.movers, []);
  assert.equal(l.rows, 1);
});

test('a group of one (a new group pending review) frames the student and puts the label beside it', () => {
  const l = layoutBoard({ ...demo, group: [] });
  assert.deepEqual(l.cluster, { row: 2, rows: 1 });
  assert.deepEqual(l.label, { col: 1, row: 2 });
});

test('one other in the group moves to the cell beside the student', () => {
  const l = layoutBoard({ ...demo, group: [demo.group[0]!] });
  assert.deepEqual(l.movers, ['A']);
  assert.deepEqual(cell(l, 'A', 'at')[0], 1);
  assert.deepEqual(cell(l, 'A', 'to'), [1, cell(l, 'you', 'at')[1]!]);
});

test('a big consultation shows at most eight slips, two from the group, and counts the rest', () => {
  const many = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, excerpt: 'x', theme: 'food' }));
  const l = layoutBoard({ ...demo, group: many('g', 9), differing: many('d', 3), others: many('o', 20), contributors: 41 });
  assert.equal(l.slips.length, BOARD_SLIPS_MAX);
  assert.equal(l.movers.length, 2);
  assert.equal(l.hidden, 41 - BOARD_SLIPS_MAX);
  assert.ok(l.slips.some((s) => s.kind === 'differing'), 'differing accounts are kept before other themes');
});

test('tilts are small and the same every time', () => {
  const a = layoutBoard(demo), b = layoutBoard(demo);
  assert.deepEqual(a.slips.map((s) => s.tilt), b.slips.map((s) => s.tilt));
  assert.ok(a.slips.every((s) => Math.abs(s.tilt) <= 1.2));
});

test('the timeline: stamp, carry in, press, count, the two carries in order, then frame, kept and closing', () => {
  const t = momentTimeline(['B', 'A'], { grouped: true, kept: true });
  assert.deepEqual(t.map((e) => e.kind + (e.id ? `:${e.id}` : '')), [
    'stamp', 'carryIn', 'pressIn', 'count', 'lift:B', 'move:B', 'lift:A', 'move:A', 'press:B', 'press:A', 'group', 'kept', 'closing',
  ]);
  assert.equal(t.at(-1)!.at, 4350);
  assert.ok(t.every((e, i) => i === 0 || e.at >= t[i - 1]!.at), 'events are in time order');
});

test('with no group and nothing kept the moment is short', () => {
  const t = momentTimeline([], { grouped: false, kept: false });
  assert.deepEqual(t.map((e) => e.kind), ['stamp', 'carryIn', 'pressIn', 'count', 'closing']);
  assert.ok(t.at(-1)!.at < 2000);
});

test('playing every event reaches the end state', () => {
  const movers = ['B', 'A'];
  const played = momentTimeline(movers, { grouped: true, kept: true }).reduce(applyEvent, MOMENT_START);
  assert.deepEqual(played, momentEnd(movers));
  assert.deepEqual(played.lifted, []);
});
