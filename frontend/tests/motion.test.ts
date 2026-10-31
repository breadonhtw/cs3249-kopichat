import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countFrames, frameAt } from '../src/motion.ts';

test('count frames tick from 6 to 7', () => {
  const f = countFrames(6, 7, 600); assert.equal(f[0], 6); assert.equal(f.at(-1), 7);
});

test('count frames are integers, never leave the range, and never go backwards', () => {
  const f = countFrames(6, 7, 600);
  assert.ok(f.length >= 2);
  assert.ok(f.every((n, i) => Number.isInteger(n) && n >= 6 && n <= 7 && (i === 0 || n >= f[i - 1]!)));
  const g = countFrames(0, 1, 0);
  assert.deepEqual([g[0], g.at(-1)], [0, 1]);
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
