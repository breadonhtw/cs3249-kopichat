import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planBeats, countFrames, frameAt, BEATS } from '../src/motion.ts';
const agg = { group: { name: 'g', count: 3, others: [] }, contributors: 7, seeds: 6 } as any;
test('beats in order and within 4.5s', () => {
  const b = planBeats(agg, false);
  assert.deepEqual(b.map(x => x.name), ['stamp', 'writeIn', 'bracket', 'kept', 'closing']);
  assert.ok(b.at(-1)!.at + b.at(-1)!.duration <= 4500);
});
test('reduced motion collapses to end state', () => {
  assert.ok(planBeats(agg, true).every(x => x.duration === 0 && x.at === 0));
});
test('first contributor has no bracket beat', () => {
  assert.ok(!planBeats({ ...agg, group: { name: null, count: 1, others: [] } }, false).some(x => x.name === 'bracket'));
});
test('count frames tick from 6 to 7', () => {
  const f = countFrames(6, 7, 600); assert.equal(f[0], 6); assert.equal(f.at(-1), 7);
});

test('beat windows are the ones in BEATS', () => {
  const b = planBeats(agg, false);
  assert.deepEqual(b.map(x => [x.at, x.at + x.duration]), [BEATS.stamp, BEATS.writeIn, BEATS.bracket, BEATS.kept, BEATS.closing]);
});
test('without a bracket the kept beat starts where the bracket would have', () => {
  const b = planBeats({ ...agg, group: { name: null, count: 1, others: [] } }, false);
  assert.deepEqual(b.map(x => x.name), ['stamp', 'writeIn', 'kept', 'closing']);
  assert.equal(b[2]!.at, BEATS.bracket[0]);
  assert.equal(b[3]!.at, b[2]!.at + b[2]!.duration);
  assert.ok(b[3]!.at + b[3]!.duration <= 4500);
});
test('count frames are integers, never leave the range, and never go backwards', () => {
  const f = countFrames(6, 7, 600);
  assert.ok(f.length >= 2);
  assert.ok(f.every((n, i) => Number.isInteger(n) && n >= 6 && n <= 7 && (i === 0 || n >= f[i - 1]!)));
  const g = countFrames(0, 1, 0);
  assert.deepEqual([g[0], g.at(-1)], [0, 1]);
});

test('the closing line is the last beat to finish', () => {
  const b = planBeats(agg, false);
  assert.equal(b.at(-1)!.name, 'closing');
  assert.ok(b.every(x => x.at + x.duration <= b.at(-1)!.at + b.at(-1)!.duration));
});
test('frameAt clamps to the first and last frame', () => {
  const f = countFrames(6, 7, 600);
  assert.equal(frameAt(f, -5, 600), 6);
  assert.equal(frameAt(f, 0, 600), 6);
  const mid = frameAt(f, 300, 600);
  assert.ok(mid >= 6 && mid <= 7);
  assert.equal(frameAt(f, 600, 600), 7);
  assert.equal(frameAt(f, 5000, 600), 7);
  assert.equal(frameAt([3], -1, 600), 3);
  assert.equal(frameAt(f, 100, 0), 7);
});
