import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowDisplay } from '../src/components/SummaryCard.tsx';
import { initialSession, sessionReducer } from '../src/useSession.ts';

test('row display states', () => {
  assert.deepEqual(rowDisplay({ key: 'often', label: 'How often', text: '', status: 'not_given' }), { text: 'not given', muted: true, note: null });
  assert.deepEqual(rowDisplay({ key: 'often', label: 'How often', text: '3 times', status: 'edited' }), { text: '“3 times”', muted: false, note: 'edited by you' });
  assert.deepEqual(rowDisplay({ key: 'effect', label: 'Effect on you', text: 'no effect on me', status: 'explicit_none' }), { text: '“no effect on me”', muted: false, note: null });
});

test('skipped and quoted rows', () => {
  assert.deepEqual(rowDisplay({ key: 'saw', label: 'What you saw', text: '', status: 'skipped' }), { text: 'skipped', muted: true, note: null });
  assert.deepEqual(rowDisplay({ key: 'what', label: 'What happened', text: 'the lift broke', status: 'quoted' }), { text: '“the lift broke”', muted: false, note: null });
});

test('summary event stores the rows verbatim and clears the error', () => {
  const rows = [{ key: 'what', label: 'What happened', text: 'the lift broke', status: 'quoted' as const }];
  const s = sessionReducer({ ...initialSession, phase: 'summary', error: 'x' }, { type: 'summary', rows });
  assert.deepEqual(s.summary, rows);
  assert.equal(s.error, null);
  assert.equal(s.phase, 'summary');
});
