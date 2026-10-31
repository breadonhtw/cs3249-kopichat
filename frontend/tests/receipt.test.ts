import { test } from 'node:test';
import assert from 'node:assert/strict';
import { themeLabel, themeShort } from '../src/themeLabel.ts';
import { denominatorLine, placementLines, youExcerptOf } from '../src/receiptLines.ts';

const agg = {
  theme: 'transport',
  group: { name: 'Morning boarding at Kent Ridge MRT', count: 3, others: [{ id: 'a', excerpt: 'Two buses passed full' }, { id: 'b', excerpt: 'Waited 25 minutes' }] },
  differing: [{ id: 'd', excerpt: 'Bus was fine for me', note: 'No effect on me' }],
} as any;

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

test('the denominator names seeds, other real accounts and you', () => {
  assert.equal(denominatorLine({ contributors: 7, seeds: 6 }), '(6 fictional seed accounts + you)');
  assert.equal(denominatorLine({ contributors: 8, seeds: 6 }), '(6 fictional seed accounts + 1 other + you)');
  assert.equal(denominatorLine({ contributors: 10, seeds: 6 }), '(6 fictional seed accounts + 3 others + you)');
});

test('an account awaiting review claims no group and no first report', () => {
  const fellBack = { theme: 'needs_review', needs_review: true, group: { name: null, count: 1, others: [] } } as any;
  assert.deepEqual(placementLines(fellBack), ['Not grouped yet. A reviewer will place it.']);
  const unsure = { theme: 'transport', needs_review: true, group: { name: null, count: 1, others: [] } } as any;
  assert.deepEqual(placementLines(unsure), ['Not grouped yet. A reviewer will place it.']);
  for (const lines of [placementLines(fellBack), placementLines(unsure)]) {
    assert.ok(!lines.some((l) => l.includes('first to report')));
  }
});

test('a grouped account names its group and the others in it', () => {
  assert.deepEqual(placementLines(agg), ['Group: Morning boarding at Kent Ridge MRT', 'You and 2 others']);
  const pending = { theme: 'transport', needs_review: false, group: { name: 'New group, pending review', pending: true, count: 1, others: [] } } as any;
  assert.deepEqual(placementLines(pending), ['Group: New group, pending review', 'You are the first to report this']);
});

test('short theme names for slips', () => {
  assert.equal(themeShort('transport'), 'Transport');
  assert.equal(themeShort('food'), 'Food court');
  assert.equal(themeShort('unheard-of'), 'Other');
});
