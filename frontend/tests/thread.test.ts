import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderItemClass } from '../src/components/Thread.tsx';
import { chipRow, DEFAULT_CHIPS } from '../src/chips.ts';
import { failureEvent, initialSession, isCrisis, sessionReducer } from '../src/useSession.ts';
import { shouldSend } from '../src/composerKeys.ts';
import { ApiError } from '../src/api/client.ts';
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

const result = (reply: string, unavailable = false): TurnResult => ({ reply, chips: DEFAULT_CHIPS, options: [], state: {} as any, counter: '', phase: 'chat', unavailable });
const UNAVAILABLE = 'The assistant is unavailable right now. Your replies are kept. Send your message again in a moment.';

test('an unavailable reply is a status line, sets the phase and counts in a row; a normal reply resets the count', () => {
  const once = sessionReducer({ ...initialSession, phase: 'chat' }, { type: 'turn', result: result(UNAVAILABLE, true) });
  assert.equal(once.phase, 'unavailable');
  assert.equal(once.unavailableStreak, 1);
  assert.deepEqual(once.thread.at(-1), { role: 'status', text: UNAVAILABLE });
  const twice = sessionReducer(once, { type: 'turn', result: result(UNAVAILABLE, true) });
  assert.equal(twice.unavailableStreak, 2);
  const ok = sessionReducer(twice, { type: 'turn', result: result('Q?') });
  assert.equal(ok.phase, 'chat');
  assert.equal(ok.unavailableStreak, 0);
  assert.deepEqual(ok.thread.at(-1), { role: 'agent', text: 'Q?' });
});

test('the same reply text without the unavailable flag is an ordinary agent reply', () => {
  const s = sessionReducer({ ...initialSession, phase: 'chat' }, { type: 'turn', result: result(UNAVAILABLE) });
  assert.equal(s.unavailableStreak, 0);
  assert.equal(s.thread.at(-1)?.role, 'agent');
});

test('an unreachable server is a status line and counts toward the fallback', () => {
  const before = sessionReducer({ ...initialSession, phase: 'chat' }, { type: 'student', text: 'hello' });
  const after = sessionReducer(before, { type: 'unreachable' });
  assert.equal(after.phase, 'unavailable');
  assert.equal(after.unavailableStreak, 1);
  assert.deepEqual(after.thread.at(-1), { role: 'status', text: 'Could not reach the assistant. Your message was not sent.' });
  assert.deepEqual(after.chips, DEFAULT_CHIPS);
});

test('a rejected request shows its detail, never counts toward the fallback and leaves the phase', () => {
  const s = sessionReducer({ ...initialSession, phase: 'chat', unavailableStreak: 1 }, { type: 'rejected', message: 'Unknown session.' });
  assert.equal(s.phase, 'chat');
  assert.equal(s.unavailableStreak, 1);
  assert.deepEqual(s.thread.at(-1), { role: 'status', text: 'Unknown session.' });
});

test('failures are classified: 4xx rejected, network and 5xx unreachable', () => {
  assert.deepEqual(failureEvent(new ApiError(404, 'Unknown session.')), { type: 'rejected', message: 'Unknown session.' });
  assert.deepEqual(failureEvent(new ApiError(503, 'x')), { type: 'unreachable' });
  assert.deepEqual(failureEvent(new TypeError('Failed to fetch')), { type: 'unreachable' });
});

test('an unsent message leaves the thread and returns to the composer', () => {
  const sent = sessionReducer({ ...initialSession, phase: 'chat' }, { type: 'student', text: 'hello' });
  const dropped = sessionReducer(sent, { type: 'discardStudent', text: 'hello' });
  assert.deepEqual(dropped.thread, []);
  const back = sessionReducer(dropped, { type: 'restoreDraft', text: 'hello' });
  assert.equal(back.draft?.text, 'hello');
  assert.equal(sessionReducer(back, { type: 'draftTaken' }).draft, null);
});

test('discardStudent removes only the latest matching student item', () => {
  const s = sessionReducer(
    { ...initialSession, thread: [{ role: 'student', text: 'a' }, { role: 'agent', text: 'Q' }, { role: 'student', text: 'a' }, { role: 'status', text: 'x' }] },
    { type: 'discardStudent', text: 'a' },
  );
  assert.deepEqual(s.thread, [{ role: 'student', text: 'a' }, { role: 'agent', text: 'Q' }, { role: 'status', text: 'x' }]);
});

test('posted fallback answers are remembered by index', () => {
  const a = sessionReducer(initialSession, { type: 'fallbackPosted', index: 2 });
  const b = sessionReducer(a, { type: 'fallbackPosted', index: 0 });
  assert.deepEqual(b.fallbackPosted, [2, 0]);
});

const key = (over: Record<string, unknown> = {}) => ({ key: 'Enter', shiftKey: false, keyCode: 13, nativeEvent: { isComposing: false }, ...over }) as any;

test('Enter sends; Shift+Enter, composition and keyCode 229 do not', () => {
  assert.equal(shouldSend(key()), true);
  assert.equal(shouldSend(key({ shiftKey: true })), false);
  assert.equal(shouldSend(key({ nativeEvent: { isComposing: true } })), false);
  assert.equal(shouldSend(key({ keyCode: 229 })), false);
  assert.equal(shouldSend(key({ key: 'a', keyCode: 65 })), false);
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
