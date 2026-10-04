import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SNACKS, FULL_AFTER, FULL_WINDOW_MS, favouriteOf, snackOutcome, eatSnack, snackById } from '../../phone/js/core/snacks.js';

const MIN = 60_000;

test('every pet has a favourite from the menu', () => {
  for (const pet of ['mochi', 'pip', 'nimbus', 'plum', 'sprig', 'ember', 'puff', 'bun', 'inky', 'pebble', 'lumi', 'opal']) {
    assert.ok(snackById(favouriteOf(pet)), pet);
  }
  assert.equal(favouriteOf('unknown'), null);
  assert.ok(Object.isFrozen(SNACKS));
});

test('outcomes: favourite beats yum, chili is spicy unless you are Ember', () => {
  assert.equal(snackOutcome([], 'mochi', 'onigiri', 0), 'favourite');
  assert.equal(snackOutcome([], 'mochi', 'cookie', 0), 'yum');
  assert.equal(snackOutcome([], 'mochi', 'chili', 0), 'spicy');
  assert.equal(snackOutcome([], 'ember', 'chili', 0), 'favourite');
  assert.equal(snackOutcome([], 'mochi', 'nope', 0), null);
});

test('a full pet politely says no; it gets hungry again after the window', () => {
  let eaten = [];
  const t0 = 1_000_000;
  for (let i = 0; i < FULL_AFTER; i++) {
    const r = eatSnack(eaten, 'pip', 'berry', t0 + i * MIN);
    assert.notEqual(r.outcome, 'full', `snack ${i + 1}`);
    eaten = r.eaten;
  }
  const full = eatSnack(eaten, 'pip', 'cookie', t0 + FULL_AFTER * MIN);
  assert.equal(full.outcome, 'full');
  assert.equal(full.eaten, eaten, 'nothing eaten when full');
  const later = eatSnack(eaten, 'pip', 'cookie', t0 + FULL_WINDOW_MS + FULL_AFTER * MIN);
  assert.equal(later.outcome, 'favourite');
  assert.ok(later.eaten.length <= FULL_AFTER, 'old snacks are forgotten');
});

test('eatSnack is pure and ignores unknown snacks', () => {
  const eaten = Object.freeze([5]);
  const r = eatSnack(eaten, 'bun', 'berry', 10);
  assert.deepEqual(eaten, [5]);
  assert.deepEqual(r.eaten, [5, 10]);
  assert.deepEqual(eatSnack(eaten, 'bun', 'rock', 10), { outcome: null, eaten });
});
