import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderItemClass } from '../src/components/Thread.tsx';
import { chipRow, DEFAULT_CHIPS } from '../src/chips.ts';
import { initialSession, sessionReducer, UNAVAILABLE_TEXT } from '../src/useSession.ts';
import type { TurnResult } from '../src/api/client.ts';

test('agent turns are not bubbles', () => {
  assert.equal(renderItemClass({ role: 'agent', text: 'x' }), 'turn turn--agent');
  assert.equal(renderItemClass({ role: 'student', text: 'x' }), 'turn turn--student');
  assert.equal(renderItemClass({ role: 'status', text: 'x' }), 'turn turn--status');
});

test('chip row shows the server chips, then Check my summary once a turn has been answered', () => {
  assert.deepEqual(chipRow(DEFAULT_CHIPS, [], 0, 'chat'), DEFAULT_CHIPS);
  assert.deepEqual(chipRow(DEFAULT_CHIPS, [], 1, 'chat'), [...DEFAULT_CHIPS, 'Check my summary']);
  assert.deepEqual(chipRow(['Continue without the name', 'Stop'], [], 2, 'chat'), ['Continue without the name', 'Stop', 'Check my summary']);
});

test('chip row stays empty when the server sends no chips, and never adds the summary chip outside chat', () => {
  assert.deepEqual(chipRow([], [], 3, 'chat'), []);
  assert.deepEqual(chipRow(DEFAULT_CHIPS, [], 3, 'summary'), DEFAULT_CHIPS);
  assert.deepEqual(chipRow(['Delete', 'Keep draft'], [], 3, 'chat'), ['Delete', 'Keep draft']);
});

test('options replace the chips and carry no summary chip', () => {
  assert.deepEqual(chipRow(DEFAULT_CHIPS, ['A', 'None of these'], 2, 'chat'), ['A', 'None of these']);
});

const result = (reply: string): TurnResult => ({ reply, chips: DEFAULT_CHIPS, options: [], state: {} as any, counter: '', phase: 'chat' });

test('an unavailable reply sets the phase and counts in a row; a normal reply resets the count', () => {
  const once = sessionReducer({ ...initialSession, phase: 'chat' }, { type: 'turn', result: result(UNAVAILABLE_TEXT) });
  assert.equal(once.phase, 'unavailable');
  assert.equal(once.unavailableStreak, 1);
  const twice = sessionReducer(once, { type: 'turn', result: result(UNAVAILABLE_TEXT) });
  assert.equal(twice.unavailableStreak, 2);
  const ok = sessionReducer(twice, { type: 'turn', result: result('Q?') });
  assert.equal(ok.phase, 'chat');
  assert.equal(ok.unavailableStreak, 0);
});

test('a failed turn request is an unavailable reply, and the thread stays intact', () => {
  const before = sessionReducer({ ...initialSession, phase: 'chat' }, { type: 'student', text: 'hello' });
  const after = sessionReducer(before, { type: 'unavailable' });
  assert.equal(after.phase, 'unavailable');
  assert.equal(after.unavailableStreak, 1);
  assert.deepEqual(after.thread, [...before.thread, { role: 'agent', text: UNAVAILABLE_TEXT }]);
  assert.deepEqual(after.chips, DEFAULT_CHIPS);
});

test('restore puts the pending question and the default chips back', () => {
  const s = sessionReducer(
    { ...initialSession, phase: 'chat', chips: ['Delete', 'Keep draft'], serverState: { pending_question: 'When?' } },
    { type: 'restore' },
  );
  assert.deepEqual(s.thread.at(-1), { role: 'agent', text: 'When?' });
  assert.deepEqual(s.chips, DEFAULT_CHIPS);
  assert.deepEqual(s.options, []);
});

test('loading a session clears an earlier error', () => {
  const s = sessionReducer({ ...initialSession, error: 'x' }, { type: 'loaded', consultation: {} as any });
  assert.equal(s.error, null);
});
