import { test } from 'node:test';
import assert from 'node:assert/strict';
import { screenFor } from '../src/screenFor.ts';
import type { Phase } from '../src/api/client.ts';

const consultation = { id: 'c', title: 't', why: 'w', closing_date: 'd', overall_options: [] };
const account = { id: 'a', ref_code: 'KR-1' };
const at = (phase: Phase, extra: Record<string, unknown> = {}) => ({ phase, consultation, account: null, error: null, ...extra }) as any;

test('every phase has a screen', () => {
  assert.equal(screenFor(at('consent')), 'consent');
  assert.equal(screenFor(at('overall')), 'overall');
  assert.equal(screenFor(at('chat')), 'chat');
  assert.equal(screenFor(at('unavailable')), 'chat');
  assert.equal(screenFor(at('summary')), 'summary');
  assert.equal(screenFor(at('receipt', { account })), 'receipt');
  assert.equal(screenFor(at('done')), 'done');
});

test('looking back from the summary shows the chat', () => {
  assert.equal(screenFor(at('summary'), true), 'chat');
  assert.equal(screenFor(at('chat'), true), 'chat');
});

test('deleted is a withdrawal with an account and a deleted draft without one', () => {
  assert.equal(screenFor(at('deleted', { account })), 'withdrawn');
  assert.equal(screenFor(at('deleted')), 'deleted');
});

test('before the consultation loads: loading, or the error', () => {
  assert.equal(screenFor(at('consent', { consultation: null })), 'loading');
  assert.equal(screenFor(at('consent', { consultation: null, error: 'x' })), 'error');
});

test('an unknown phase from the server is never rendered raw', () => {
  assert.equal(screenFor(at('mystery' as Phase)), 'error');
});
