import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionReducer, initialSession } from '../src/useSession.ts';

test('turn appends agent reply and sets chips and counter', () => {
  const s = sessionReducer({ ...initialSession, phase: 'chat' }, { type: 'turn', result: { reply: 'Q?', chips: ['Skip this question'], options: [], state: {} as any, counter: 'Follow-up 1 of up to 5', phase: 'chat', unavailable: false } });
  assert.deepEqual(s.thread.at(-1), { role: 'agent', text: 'Q?' });
  assert.equal(s.counter, 'Follow-up 1 of up to 5');
});

test('submitted moves to receipt with aggregate', () => {
  const s = sessionReducer({ ...initialSession, phase: 'summary' }, { type: 'submitted', account: { id: 'a', ref_code: 'KR-0147' }, aggregate: { contributors: 7 } as any });
  assert.equal(s.phase, 'receipt'); assert.equal(s.aggregate?.contributors, 7);
});

test('error never changes phase', () => {
  const s = sessionReducer({ ...initialSession, phase: 'chat' }, { type: 'error', message: 'x' });
  assert.equal(s.phase, 'chat'); assert.equal(s.error, 'x');
});

test('previousServerState holds the prior state after a turn', () => {
  const first = { dims: { q1_what: { score: 1 } } } as any;
  const second = { dims: { q1_what: { score: 2 } } } as any;
  const turn = (state: any) => ({ type: 'turn' as const, result: { reply: 'Q?', chips: [], options: [], state, counter: '', phase: 'chat' as const, unavailable: false } });
  const a = sessionReducer({ ...initialSession, phase: 'chat' }, turn(first));
  assert.equal(a.previousServerState, null);
  const b = sessionReducer(a, turn(second));
  assert.equal(b.previousServerState, first);
  assert.equal(b.serverState, second);
});

test('loading a session that has sent its account lands on the settled receipt', () => {
  const account = { id: 'a', ref_code: 'KR-0147' };
  const aggregate = { contributors: 7, seeds: 6 } as any;
  const summary = [{ key: 'overall', label: 'Overall view', text: 'Negatively', status: 'quoted' as const }];
  const s = sessionReducer(initialSession, {
    type: 'loaded',
    consultation: {} as any,
    phase: 'receipt',
    serverState: { phase: 'receipt', approved: true },
    account,
    aggregate,
    summary,
  });
  assert.equal(s.phase, 'receipt');
  assert.deepEqual(s.account, account);
  assert.equal(s.aggregate, aggregate);
  assert.deepEqual(s.summary, summary);
  assert.equal(s.restoredReceipt, true);
});

test('a withdrawn account loads as withdrawn, and a fresh session has no receipt', () => {
  const w = sessionReducer(initialSession, { type: 'loaded', consultation: {} as any, phase: 'deleted', account: { id: 'a', ref_code: 'KR-1' } });
  assert.equal(w.phase, 'deleted');
  assert.notEqual(w.account, null);
  const fresh = sessionReducer({ ...initialSession, account: { id: 'x', ref_code: 'KR-2' } }, { type: 'loaded', consultation: {} as any, phase: 'consent' });
  assert.equal(fresh.account, null);
  assert.equal(fresh.restoredReceipt, false);
  assert.deepEqual(fresh.summary, []);
});

test('a live submission plays the receipt', () => {
  const s = sessionReducer({ ...initialSession, phase: 'summary', restoredReceipt: true }, { type: 'submitted', account: { id: 'a', ref_code: 'KR-1' }, aggregate: {} as any });
  assert.equal(s.restoredReceipt, false);
});
