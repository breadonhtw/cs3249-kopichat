import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countLine, drawnLine, groupFacts, pickGroup } from '../src/reviewLines.ts';

test('a count says how many of the group said something', () => {
  assert.equal(countLine({ said: 3, of: 3 }), '3 of 3 said');
  assert.equal(countLine({ said: 0, of: 2 }), '0 of 2 said');
});

test('accounts outside the group are counted as kept visible', () => {
  assert.equal(countLine({ said: 2, of: null }), '2 accounts kept visible');
  assert.equal(countLine({ said: 1, of: null }), '1 account kept visible');
  assert.equal(countLine({ said: 0, of: null }), 'None outside this group');
});

test('an illustration says what it is drawn from and what it is not', () => {
  assert.equal(drawnLine(3), 'Illustration of what 3 accounts describe, not a photograph of one event.');
  assert.equal(drawnLine(1), 'Illustration of what 1 account describes, not a photograph of one event.');
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
