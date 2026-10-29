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

test('fallback sends the written answers in one turn, as an action', async () => {
  const { f, calls } = fakeFetch({ '/api/turn': () => ({ json: { phase: 'summary' } }) });
  const r = await createClient(f, 'sid').fallback({ q1_what: 'The A2 was full', q3_effect: 'late' });
  assert.equal(r.phase, 'summary');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body, { session_id: 'sid', action: 'fallback', answers: { q1_what: 'The A2 was full', q3_effect: 'late' } });
});

test('an empty contact is sent as it is, to clear the stored one', async () => {
  const { f, calls } = fakeFetch({ '/api/contact': () => ({ json: { ok: true } }) });
  await createClient(f, 'sid').contact('');
  assert.deepEqual(calls[0].body, { session_id: 'sid', contact: '' });
});

test('renew switches every later request to a new session id', async () => {
  const { f, calls } = fakeFetch({ '/api/session': () => ({ json: {} }), '/api/summary/new-id': () => ({ json: { rows: [], approved: false } }) });
  const c = createClient(f, 'old-id');
  c.renew('new-id');
  assert.equal(c.sessionId, 'new-id');
  await c.session();
  await c.summary();
  assert.deepEqual(calls[0].body, { session_id: 'new-id' });
  assert.equal(calls[1].url, '/api/summary/new-id');
  assert.ok(!calls.some((call) => call.url === '/api/admin/reset'));
});

test('renew without an id stores a fresh one for the tab', async () => {
  const store = new Map<string, string>();
  const g = globalThis as any;
  const saved = g.sessionStorage;
  g.sessionStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) };
  try {
    const c = createClient((async () => ({ ok: true, status: 200, json: async () => ({}) })) as any, 'old-id');
    c.renew();
    assert.notEqual(c.sessionId, 'old-id');
    assert.equal(store.get('kopichat.session'), c.sessionId);
  } finally {
    g.sessionStorage = saved;
  }
});
