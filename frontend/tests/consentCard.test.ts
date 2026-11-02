import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consentQuestion, declineLine, declinedLine, rowsToggleLabel, valueLine } from '../src/components/ConsentCard.tsx';
import { consentRows } from '../src/copy.ts';

test('declined line names a real closing date', () => {
  assert.equal(declinedLine('14 November'), 'No problem. You can open this link again any time before 14 November.');
});

test('declined line drops the date when it is missing or a placeholder', () => {
  const bare = 'No problem. You can open this link again any time.';
  assert.equal(declinedLine('[closing date]'), bare);
  assert.equal(declinedLine(''), bare);
  assert.equal(declinedLine(undefined), bare);
});

test('the rows control reads Collapse all only once every row is open', () => {
  assert.equal(rowsToggleLabel(0, 4), 'Expand all');
  assert.equal(rowsToggleLabel(2, 4), 'Expand all');
  assert.equal(rowsToggleLabel(4, 4), 'Collapse all');
  assert.equal(rowsToggleLabel(0, 0), 'Expand all');
});

test('the consent question is asked from the consultation’s own name', () => {
  assert.equal(consentQuestion('Campus visitors and student experience'), 'Take part in NUSSU’s consultation on campus visitors and student experience?');
  assert.equal(consentQuestion(''), 'Take part in NUSSU’s consultation on this topic?');
});

test('the value line turns the consultation’s "To …" into a sentence', () => {
  assert.equal(valueLine('To understand how visitor presence on campus is affecting students.'), 'NUSSU is asking to understand how visitor presence on campus is affecting students.');
  assert.equal(valueLine('Study spaces during reading week'), 'NUSSU is asking. Study spaces during reading week.');
});

test('declining is described plainly, with the closing date when there is one', () => {
  assert.equal(declineLine('12 November 2026'), 'If you don’t take part, nothing is collected. You can come back any time before 12 November 2026.');
  assert.equal(declineLine('[closing date]'), 'If you don’t take part, nothing is collected. You can come back any time.');
});

test('the stopping row names the withdrawal window', () => {
  const stop = consentRows('why', '12 November 2026').find((r) => r.title === 'Stopping and withdrawing');
  assert.ok(stop && stop.body.endsWith('After sending, you can withdraw your account before 12 November 2026.'));
  const bare = consentRows('why').find((r) => r.title === 'Stopping and withdrawing');
  assert.ok(bare && bare.body.endsWith('before the consultation closes.'));
});
