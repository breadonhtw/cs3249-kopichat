import { test } from 'node:test';
import assert from 'node:assert/strict';
import { declinedLine } from '../src/components/ConsentCard.tsx';

test('declined line names a real closing date', () => {
  assert.equal(declinedLine('14 November'), 'No problem. You can open this link again any time before 14 November.');
});

test('declined line drops the date when it is missing or a placeholder', () => {
  const bare = 'No problem. You can open this link again any time.';
  assert.equal(declinedLine('[closing date]'), bare);
  assert.equal(declinedLine(''), bare);
  assert.equal(declinedLine(undefined), bare);
});
