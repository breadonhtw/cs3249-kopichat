import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countLine, drawnLine, groupFacts, groupsByTheme, pickGroup, refFromSearch, reviewHref, isReviewKey, splitQuote, repeatsOf, silentLine, tallyRows, groupFromSearch, searchWithGroup } from '../src/reviewLines.ts';
import type { Strip } from '../src/api/client.ts';

test('a count says how many of the group said something', () => {
  assert.equal(countLine({ said: 3, of: 3 }), '3 of 3 said');
  assert.equal(countLine({ said: 0, of: 2 }), '0 of 2 said');
});

test('accounts outside the group are counted as kept visible', () => {
  assert.equal(countLine({ said: 2, of: null }), '2 accounts kept visible');
  assert.equal(countLine({ said: 1, of: null }), '1 account kept visible');
  assert.equal(countLine({ said: 0, of: null }), 'None outside this group');
});

test('an illustration says how many accounts it is drawn from', () => {
  assert.equal(drawnLine(3), 'Drawn from 3 accounts.');
  assert.equal(drawnLine(1), 'Drawn from 1 account.');
});

test('dates the app appended leave the quote, and stay readable beside it', () => {
  assert.deepEqual(splitQuote("Couldn't get onto the first A2; yesterday, around 8.45am [2026-10-30]"),
    { words: "Couldn't get onto the first A2; yesterday, around 8.45am", dates: ['30 Oct 2026'] });
  assert.deepEqual(splitQuote('3 times; this month [2026-10]; yesterday [2026-10-30]'),
    { words: '3 times; this month; yesterday', dates: ['Oct 2026', '30 Oct 2026'] });
  assert.deepEqual(splitQuote('late for a 9am lecture'), { words: 'late for a 9am lecture', dates: [] });
  assert.deepEqual(splitQuote('room [2026-13-01] stays'), { words: 'room stays', dates: [] });
});

test('a line repeating an earlier line word for word is marked with who said it first', () => {
  const l = (who: string, quote: string | null) => ({ who, quote, note: quote ? null : 'not said' });
  const r = repeatsOf([l('A', 'full at 9am'), l('K1', 'Got in late [2026-10-30]'), l('B', null), l('K2', 'got in late [2026-10-31]')]);
  assert.deepEqual([...r], [['K2', 'K1']]);
});

test('a section nobody spoke to is one line naming who skipped it and who never said it', () => {
  const l = (who: string, note: string) => ({ who, quote: null, note });
  assert.equal(silentLine([l('A', 'not said'), l('B', 'skipped'), l('C', 'not said')]), 'Not said by A, C. Skipped by B.');
  assert.equal(silentLine([l('A', 'not said')]), 'Not said by A.');
});

test('the head tally has a row per section, with the outside accounts counted as accounts', () => {
  const sec = (said: number, of: number | null) => ({ label: null, said: [], count: { said, of } });
  const strip: Strip = {
    group: { id: 'g', name: 'G', theme: 't', pending: false, count: 4 }, cover: null,
    panels: [
      { key: 'what', title: 'What happened', art: null, sections: [sec(4, 4)] },
      { key: 'read', title: 'Their read', art: null, sections: [sec(4, 4), sec(0, 4)] },
      { key: 'differing', title: 'Outside this group', art: null, sections: [sec(2, null)] },
    ],
  };
  assert.deepEqual(tallyRows(strip), [
    { id: 'panel-what', label: 'What happened', figure: '4 of 4' },
    { id: 'panel-read', label: 'Their read on the cause', figure: '4 of 4' },
    { id: 'panel-read', label: 'What would help', figure: '0 of 4' },
    { id: 'panel-differing', label: 'Outside this group', figure: '2 accounts' },
  ]);
});

test('the chosen group lives in the address, and only a listed group is read back', () => {
  assert.equal(groupFromSearch('?group=g2', ['g1', 'g2']), 'g2');
  assert.equal(groupFromSearch('?group=gone', ['g1']), null);
  assert.equal(groupFromSearch('', ['g1']), null);
  assert.equal(searchWithGroup('?ref=KR-3158', 'g2'), '?ref=KR-3158&group=g2');
  assert.equal(searchWithGroup('?group=g1', 'g2'), '?group=g2');
});

test('group facts name the count and a pending or model-proposed name', () => {
  assert.equal(groupFacts({ count: 3, pending: false, id: 'g' }), '3 accounts. Provisional grouping.');
  assert.equal(groupFacts({ count: 1, pending: true, id: 'g' }), '1 account. Name proposed by the model; no reviewer has named this group yet.');
  assert.equal(groupFacts({ count: 2, pending: false, id: 'ungrouped' }), '2 accounts no group holds yet. A reviewer places them.');
});

test('the first group shown is one with illustrations, else the first', () => {
  const g = (id: string, has_art: boolean) => ({ id, name: id, theme: 't', pending: false, count: 1, has_art });
  assert.equal(pickGroup([g('a', false), g('b', true)]), 'b');
  assert.equal(pickGroup([g('a', false)]), 'a');
  assert.equal(pickGroup([]), null);
});

test('the reviewer page reads a KR reference from its address, and nothing else', () => {
  assert.equal(refFromSearch('?ref=KR-3158'), 'KR-3158');
  assert.equal(refFromSearch('?ref=KR-0042&x=1'), 'KR-0042');
  assert.equal(refFromSearch(''), null);
  assert.equal(refFromSearch('?ref=KR-31'), null);
  assert.equal(refFromSearch('?ref=<script>'), null);
});

test('the jump link opens the reviewer page on that reference', () => {
  assert.equal(reviewHref('KR-3158'), '/review?ref=KR-3158');
});

test('n opens NUSSU side: a plain press only, not a held key or a shortcut', () => {
  assert.equal(isReviewKey({ key: 'n' }), true);
  assert.equal(isReviewKey({ key: 'N' }), true);
  assert.equal(isReviewKey({ key: 'n', metaKey: true }), false);
  assert.equal(isReviewKey({ key: 'n', repeat: true }), false);
  assert.equal(isReviewKey({ key: 's' }), false);
});

test('the side nav folds groups by theme, keeping server order and totalling each theme', () => {
  const g = (id: string, theme: string, count: number) => ({ id, name: id, theme, pending: false, count, has_art: false });
  const sections = groupsByTheme([g('morning', 'transport', 2), g('access', 'transport', 1), g('frontier', 'food', 1), g('no-effect', 'transport', 1), g('clb', 'study', 1)]);
  assert.deepEqual(sections.map((s) => [s.label, s.total, s.groups.map((x) => x.id)]), [
    ['Transport', 4, ['morning', 'access', 'no-effect']],
    ['Food court', 1, ['frontier']],
    ['Study and teaching', 1, ['clb']],
  ]);
  assert.deepEqual(groupsByTheme([]), []);
});
