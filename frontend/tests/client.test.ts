import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, chipAction, ApiError } from '../src/api/client.ts';

function fakeFetch(routes: Record<string, (body: any) => { status?: number; json: any }>) {
  const calls: { url: string; method: string; body: any }[] = [];
  const f = async (url: string, init: any) => {
    const body = init?.body ? JSON.parse(init.body) : null;
    calls.push({ url, method: init?.method ?? 'GET', body });
    const r = routes[url](body);
    return { ok: (r.status ?? 200) < 300, status: r.status ?? 200, json: async () => r.json };
  };
  return { f: f as unknown as typeof fetch, calls };
}

test('turn posts message and session id', async () => {
  const { f, calls } = fakeFetch({ '/api/turn': () => ({ json: { reply: 'r', chips: [], options: [], state: {}, counter: 'Follow-up 1 of up to 5', phase: 'chat' } }) });
  const c = createClient(f, 'sid');
  const r = await c.turn('hello');
  assert.equal(r.counter, 'Follow-up 1 of up to 5');
  assert.deepEqual(calls[0].body, { session_id: 'sid', message: 'hello' });
});

test('turn omits undefined keys and sends actions as actions', async () => {
  const { f, calls } = fakeFetch({ '/api/turn': () => ({ json: {} }) });
  const c = createClient(f, 'sid');
  await c.turn(undefined, 'skip');
  assert.deepEqual(calls[0].body, { session_id: 'sid', action: 'skip' });
  assert.equal('message' in calls[0].body, false);
});

test('overall sends null for a declined value', async () => {
  const { f, calls } = fakeFetch({ '/api/overall': () => ({ json: {} }) });
  await createClient(f, 'sid').overall(null);
  assert.deepEqual(calls[0].body, { session_id: 'sid', value: null });
});

test('consent sends agreed true', async () => {
  const { f, calls } = fakeFetch({ '/api/consent': () => ({ json: { phase: 'overall', state: {} } }) });
  const r = await createClient(f, 'sid').consent();
  assert.equal(r.phase, 'overall');
  assert.deepEqual(calls[0].body, { session_id: 'sid', agreed: true });
});

test('summary reads and edits through the session path', async () => {
  const { f, calls } = fakeFetch({
    '/api/summary/sid': (body) => (body ? { json: { rows: [{ key: 'k', text: 't' }] } } : { json: { rows: [], approved: false } }),
  });
  const c = createClient(f, 'sid');
  assert.equal((await c.summary()).approved, false);
  await c.editSummary('k', 't');
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[1].method, 'PATCH');
  assert.deepEqual(calls[1].body, { key: 'k', text: 't' });
});

test('submit always sends approved true and surfaces errors', async () => {
  const { f, calls } = fakeFetch({ '/api/submit': () => ({ status: 400, json: { detail: 'not approved' } }) });
  await assert.rejects(() => createClient(f, 'sid').submit(), (e: unknown) => e instanceof ApiError && e.status === 400 && e.message === 'not approved');
  assert.equal(calls[0].body.approved, true);
});

test('withdraw and contact use the session, never an account id', async () => {
  const { f, calls } = fakeFetch({ '/api/withdraw': () => ({ json: { ok: true } }), '/api/contact': () => ({ json: { ok: true } }) });
  const c = createClient(f, 'sid');
  await c.withdraw();
  await c.contact('me@u.nus.edu');
  assert.deepEqual(calls[0].body, { session_id: 'sid' });
  assert.deepEqual(calls[1].body, { session_id: 'sid', contact: 'me@u.nus.edu' });
});

test('chipAction maps labels to actions and no-op chips to null', () => {
  assert.equal(chipAction('Skip this question'), 'skip');
  assert.equal(chipAction('Why do you ask?'), 'why');
  assert.equal(chipAction('Is this anonymous?'), 'anonymous');
  assert.equal(chipAction('Stop and delete'), 'stop');
  assert.equal(chipAction('Stop'), 'stop');
  assert.equal(chipAction('Delete'), 'delete');
  assert.equal(chipAction('Check my summary'), 'finish');
  for (const l of ['Keep draft', 'Pause', 'Continue without the name', 'Continue with my general experience', 'None of these']) {
    assert.equal(chipAction(l), null);
  }
});
