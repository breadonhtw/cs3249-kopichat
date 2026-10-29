import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkName, diffCells, isEditableTarget, isToggleKey, nextLine, storedLine } from '../src/components/SystemView.tsx';

test('changed cells are named', () => {
  const prev = { dims: { q1_what: { score: 1, state: 'provided', checks: { place: null } } } } as any;
  const next = { dims: { q1_what: { score: 2, state: 'provided', checks: { place: 'Kent Ridge MRT' } } } } as any;
  assert.deepEqual([...diffCells(prev, next)].sort(), ['q1_what.checks.place', 'q1_what.score']);
});

test('nothing is marked on the first state or when nothing changed', () => {
  const next = { dims: { q1_what: { score: 2, state: 'provided', checks: { place: 'x' } } } } as any;
  assert.equal(diffCells(null, next).size, 0);
  assert.equal(diffCells(next, structuredClone(next)).size, 0);
});

test('state, interpretation and pending question changes are named', () => {
  const prev = { dims: { q3_effect: { score: 0, state: 'not_asked', checks: {} } }, interpretation: { cause: null, uncertain: false }, pending_question: 'a' } as any;
  const next = { dims: { q3_effect: { score: 0, state: 'declined', checks: {} } }, interpretation: { cause: 'crowding', uncertain: true }, pending_question: 'b' } as any;
  assert.deepEqual(
    [...diffCells(prev, next)].sort(),
    ['interpretation.cause', 'interpretation.uncertain', 'pending_question', 'q3_effect.state'],
  );
});

test('the next line is the pending question, or summary', () => {
  assert.equal(nextLine({ phase: 'chat', pending_question: 'What happened?' } as any), 'Next: What happened?');
  assert.equal(nextLine({ phase: 'summary', pending_question: null } as any), 'Next: summary');
  assert.equal(nextLine({ phase: 'chat', pending_question: null } as any), 'Next: none');
});

test('the stored line names theme and group, and is provisional', () => {
  const aggregate = { theme: 'transport', group: { name: 'Bus 95 crowding', count: 3, others: [] } } as any;
  assert.equal(storedLine(aggregate), 'Stored. Theme: Transport access and crowding. Group: Bus 95 crowding. Provisional.');
  assert.equal(storedLine({ theme: 'other', group: { name: null, count: 1, others: [] } } as any), 'Stored. Theme: Other. Group: none. Provisional.');
});

test('the s key is ignored while focus is in a text control', () => {
  assert.equal(isEditableTarget({ tagName: 'TEXTAREA' } as any), true);
  assert.equal(isEditableTarget({ tagName: 'INPUT' } as any), true);
  assert.equal(isEditableTarget({ tagName: 'DIV', isContentEditable: true } as any), true);
  assert.equal(isEditableTarget({ tagName: 'BUTTON' } as any), false);
  assert.equal(isEditableTarget(null), false);
});

test('the toggle key is a plain s in either case, not held, not part of a shortcut', () => {
  assert.equal(isToggleKey({ key: 's' }), true);
  assert.equal(isToggleKey({ key: 'S' }), true);
  assert.equal(isToggleKey({ key: 'a' }), false);
  assert.equal(isToggleKey({ key: 's', ctrlKey: true }), false);
  assert.equal(isToggleKey({ key: 's', metaKey: true }), false);
  assert.equal(isToggleKey({ key: 's', altKey: true }), false);
  assert.equal(isToggleKey({ key: 's', repeat: true }), false);
});

test('check names read as words', () => {
  assert.equal(checkName('own_recurrence'), 'own recurrence');
  assert.equal(checkName('observed_vantage'), 'observed vantage');
  assert.equal(checkName('place'), 'place');
});
