import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient, createFormClient, linkFrom, newId, sessionKey } from '../src/api/client.ts';
import { channelFacts } from '../src/components/ConsentCard.tsx';
import { VISIBILITY_CHOICES } from '../src/components/SummaryCard.tsx';
import { consentRows, INVITATION } from '../src/copy.ts';
import { EMPTY_DRAFT, hasAnswer, parseDraft, reviewRows, toSubmission, withReviewEdit, type FormDraft } from '../src/formDraft.ts';
import { visibilityLine } from '../src/receiptLines.ts';

const FIELDS = [
  { dim: 'q1_what', key: 'what', label: 'What happened?', hint: '' },
  { dim: 'q2_often', key: 'often', label: 'How often does it happen?', hint: '' },
];

function recorder(reply: unknown = {}) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : {} });
    return new Response(JSON.stringify(reply), { status: 200 });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

test('a link names the consultation and the participant, and gets its own session', () => {
  assert.deepEqual(linkFrom('?topic=study&p=P03'), { topic: 'study', participant: 'P03' });
  assert.deepEqual(linkFrom(''), { topic: null, participant: null });
  assert.deepEqual(linkFrom('?topic=%20'), { topic: null, participant: null });
  assert.equal(sessionKey('kopichat.session', linkFrom('')), 'kopichat.session');
  assert.notEqual(sessionKey('k', linkFrom('?topic=study&p=P03')), sessionKey('k', linkFrom('?topic=study&p=P04')));
  assert.notEqual(sessionKey('k', linkFrom('?topic=study')), sessionKey('k', linkFrom('?topic=visitors')));
});

test('the chat sends the topic and participant only when the link carried them', async () => {
  const plain = recorder();
  await createClient(plain.fetchImpl, 's1', linkFrom('')).session();
  assert.deepEqual(plain.calls[0]!.body, { session_id: 's1' });
  const study = recorder();
  const client = createClient(study.fetchImpl, 's2', linkFrom('?topic=study&p=P03'));
  await client.session();
  assert.deepEqual(study.calls[0]!.body, { session_id: 's2', topic: 'study', participant: 'P03' });
  await client.reviewGroups();
  assert.equal(study.calls[1]!.url, '/api/review/groups?topic=study');
});

test('approving sends the visibility the student chose, and the default is NUSSU only', async () => {
  const r = recorder();
  const client = createClient(r.fetchImpl, 's', linkFrom(''));
  await client.submit('board');
  await client.submit();
  assert.deepEqual(r.calls[0]!.body, { session_id: 's', approved: true, visibility: 'board' });
  assert.deepEqual(r.calls[1]!.body, { session_id: 's', approved: true });
  assert.deepEqual(VISIBILITY_CHOICES.map((c) => c.value), ['nussu', 'board']);
  assert.match(visibilityLine('nussu'), /Only you and NUSSU/);
  assert.match(visibilityLine('board'), /on the noticeboard/);
});

test('the form client opens with the link and submits only as confirmed', async () => {
  const r = recorder({ ref_code: 'KR-0001', rows: [], withdrawn: false });
  const client = createFormClient(r.fetchImpl, linkFrom('?topic=study&p=P02'), 'f1');
  await client.open();
  await client.submit({ overall: null, answers: { q1_what: 'x' }, edited: [] });
  assert.deepEqual(r.calls[0], { url: '/api/form/open', body: { session_id: 'f1', topic: 'study', participant: 'P02' } });
  assert.deepEqual(r.calls[1], { url: '/api/form/submit', body: { session_id: 'f1', confirmed: true, overall: null, answers: { q1_what: 'x' }, edited: [] } });
});

test('both channels carry the same notice, except where a sentence would be untrue of one', () => {
  const chat = consentRows('why', '30 November 2026');
  const form = consentRows('why', '30 November 2026', 'form');
  assert.deepEqual(chat.map((r) => r.title), form.map((r) => r.title));
  assert.equal(chat[0]!.body, form[0]!.body);
  assert.equal(chat[2]!.body, form[2]!.body);
  assert.ok(form[3]!.body.endsWith('you can withdraw your account before 30 November 2026.'));
  assert.ok(!/AI|noticeboard|summary/.test(form.map((r) => r.body).join(' ')));
  assert.ok(!/AI|Kopichat|noticeboard/.test(Object.values(channelFacts('form')).join(' ')));
  assert.match(channelFacts('chat').questions, /AI/);
  assert.match(INVITATION, /Good, bad, no-effect and not-sure/);
});

test('a draft needs one answer, and a stored draft that is malformed is an empty one', () => {
  assert.equal(hasAnswer(EMPTY_DRAFT, FIELDS), false);
  assert.equal(hasAnswer({ ...EMPTY_DRAFT, answers: { q1_what: '   ' } }, FIELDS), false);
  assert.equal(hasAnswer({ ...EMPTY_DRAFT, answers: { q2_often: 'twice' } }, FIELDS), true);
  assert.deepEqual(parseDraft('not json'), EMPTY_DRAFT);
  assert.deepEqual(parseDraft('{"stage":"nowhere"}'), EMPTY_DRAFT);
  const kept: FormDraft = { stage: 'fields', overall: 'Mixed', answers: { q1_what: 'no seat' }, edited: [] };
  assert.deepEqual(parseDraft(JSON.stringify(kept)), kept);
});

test('the review page shows every question in order, and only a real change counts as an edit', () => {
  let draft: FormDraft = { stage: 'review', overall: null, answers: { q1_what: ' no seat at CLB ' }, edited: [] };
  assert.deepEqual(reviewRows(draft, FIELDS), [
    { key: 'overall', label: 'Overall view', text: 'Skipped', status: 'skipped' },
    { key: 'q1_what', label: 'What happened?', text: 'no seat at CLB', status: 'quoted' },
    { key: 'q2_often', label: 'How often does it happen?', text: '', status: 'skipped' },
  ]);
  assert.equal(withReviewEdit(draft, 'q1_what', 'no seat at CLB'), draft);
  draft = withReviewEdit(draft, 'q2_often', 'twice that week');
  assert.deepEqual(draft.edited, ['q2_often']);
  assert.equal(reviewRows(draft, FIELDS)[2]!.status, 'edited');
  assert.deepEqual(toSubmission(draft, FIELDS), { overall: null, answers: { q1_what: 'no seat at CLB', q2_often: 'twice that week' }, edited: ['q2_often'] });
  // an answer emptied on the review page is a skipped question, not an edit to send
  assert.deepEqual(toSubmission(withReviewEdit(draft, 'q2_often', ''), FIELDS).edited, []);
});

test('an id is still made where randomUUID is missing, as on a phone over plain http', () => {
  const insecure = { getRandomValues: (a: Uint8Array) => globalThis.crypto.getRandomValues(a) } as unknown as Crypto;
  const id = newId(insecure);
  assert.match(id, /^[0-9a-f]{32}$/);
  assert.notEqual(id, newId(insecure));
});
