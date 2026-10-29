import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderItemClass } from '../src/components/Thread.tsx';
import { chipRow, DEFAULT_CHIPS } from '../src/chips.ts';
import { initialSession, isCrisis, sessionReducer, UNAVAILABLE_TEXT } from '../src/useSession.ts';
import { closedLine } from '../src/closedLine.ts';
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

test('loading a chat-phase session rebuilds the thread and the overall view', () => {
  const s = sessionReducer(initialSession, {
    type: 'loaded',
    consultation: {} as any,
    serverState: { phase: 'chat', overall: 'Negatively', transcript: ['It was loud', 'Most nights'], pending_question: 'How did it affect you?' },
  });
  assert.equal(s.overall, 'Negatively');
  assert.deepEqual(s.thread, [
    { role: 'student', text: 'It was loud' },
    { role: 'student', text: 'Most nights' },
    { role: 'agent', text: 'How did it affect you?' },
  ]);
  assert.deepEqual(s.chips, DEFAULT_CHIPS);
  assert.equal(s.counter, '');
});

test('loading keeps a skipped overall view as null and a server counter when present', () => {
  const s = sessionReducer(initialSession, {
    type: 'loaded',
    consultation: {} as any,
    serverState: { phase: 'chat', overall: null, transcript: [], pending_question: 'Q?', counter: 'Follow-up 1 of up to 5' },
  });
  assert.equal(s.overall, null);
  assert.equal(s.counter, 'Follow-up 1 of up to 5');
  assert.deepEqual(s.thread, [{ role: 'agent', text: 'Q?' }]);
});

test('loading outside the chat phase builds no thread', () => {
  const s = sessionReducer(initialSession, { type: 'loaded', consultation: {} as any, serverState: { phase: 'overall' } });
  assert.deepEqual(s.thread, []);
  assert.equal(s.overall, null);
});

test('a crisis state is recognised and phase done is reachable', () => {
  assert.equal(isCrisis({ phase: 'chat', stopped: 'crisis' }), true);
  assert.equal(isCrisis({ phase: 'chat', stopped: null }), false);
  assert.equal(isCrisis(null), false);
  const s = sessionReducer({ ...initialSession, phase: 'chat' }, { type: 'phase', phase: 'done' });
  assert.equal(s.phase, 'done');
});

test('the closed line leaves out the withdraw clause for a placeholder date', () => {
  assert.equal(closedLine('[closing date]'), 'This consultation link has been used.');
  assert.equal(closedLine(''), 'This consultation link has been used.');
  assert.equal(closedLine('14 November'), 'This consultation link has been used. Withdraw before 14 November.');
});
