import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ledgerRows, youExcerptOf } from '../src/components/Ledger.tsx';
import { themeLabel } from '../src/themeLabel.ts';

const agg = {
  theme: 'transport',
  group: { name: 'Morning boarding at Kent Ridge MRT', count: 3, others: [{ id: 'a', excerpt: 'Two buses passed full' }, { id: 'b', excerpt: 'Waited 25 minutes' }] },
  differing: [{ id: 'd', excerpt: 'Bus was fine for me', note: 'No effect on me' }],
} as any;

test('ledger rows: group others, then the student, then differing', () => {
  const rows = ledgerRows(agg, 'the bus never stopped');
  assert.deepEqual(rows.map(r => [r.kind, r.key]), [['group', 'a'], ['group', 'b'], ['you', 'you'], ['differing', 'd']]);
  assert.deepEqual(rows[0], { kind: 'group', key: 'a', first: 'Transport access and crowding', excerpt: 'Two buses passed full' });
  assert.deepEqual(rows[2], { kind: 'you', key: 'you', first: 'Transport access and crowding', excerpt: 'the bus never stopped' });
  assert.deepEqual(rows[3], { kind: 'differing', key: 'd', first: 'No effect on me', excerpt: 'Bus was fine for me' });
});

test('first to report: only the student row, then differing', () => {
  const rows = ledgerRows({ ...agg, group: { name: null, count: 1, others: [] } }, 'x');
  assert.deepEqual(rows.map(r => r.kind), ['you', 'differing']);
});

test('the student excerpt is the what row, cut to 60 characters', () => {
  const rows = [{ key: 'what', label: 'What happened', text: 'a'.repeat(80), status: 'quoted' as const }];
  const e = youExcerptOf(rows);
  assert.equal(e.length, 60);
  assert.ok(e.endsWith('…'));
  assert.equal(youExcerptOf([{ key: 'what', label: 'x', text: 'short', status: 'quoted' }]), 'short');
  assert.equal(youExcerptOf([]), 'not given');
  assert.equal(youExcerptOf([{ key: 'what', label: 'x', text: '', status: 'not_given' }]), 'not given');
});

test('theme labels', () => {
  assert.equal(themeLabel('transport'), 'Transport access and crowding');
  assert.equal(themeLabel('food'), 'Food-court access and congestion');
  assert.equal(themeLabel('study'), 'Disruption of study and teaching');
  assert.equal(themeLabel('access'), 'Accessibility and physical obstruction');
  assert.equal(themeLabel('privacy'), 'Privacy and personal boundaries');
  assert.equal(themeLabel('other'), 'Other');
  assert.equal(themeLabel('needs_review'), 'Needs review');
  assert.equal(themeLabel('unheard-of'), 'Other');
});
