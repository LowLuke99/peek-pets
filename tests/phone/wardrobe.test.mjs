import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  WARDROBE, bestLevel, isUnlocked, unlockedBetween, wear, outfitFor, itemById,
} from '../../phone/js/core/wardrobe.js';

test('catalog: unique ids, known slots, levels climb from 1', () => {
  const ids = new Set(WARDROBE.map((i) => i.id));
  assert.equal(ids.size, WARDROBE.length);
  for (const i of WARDROBE) assert.ok(['head', 'face'].includes(i.slot), i.id);
  assert.equal(Math.min(...WARDROBE.map((i) => i.level)), 1, 'something to wear from the start');
  assert.ok(Object.isFrozen(WARDROBE));
});

test('unlocks use the best bond across all pets (switching pets never locks items)', () => {
  assert.equal(bestLevel({}), 1);
  assert.equal(bestLevel(null), 1);
  assert.equal(bestLevel({ mochi: { level: 2 }, bun: { level: 5 } }), 5);
  const crown = itemById('crown');
  assert.equal(isUnlocked(crown, { mochi: { level: 4 } }), false);
  assert.equal(isUnlocked(crown, { mochi: { level: 4 }, pip: { level: crown.level } }), true);
});

test('level-up reports exactly the newly unlocked items', () => {
  const got = unlockedBetween(1, 2).map((i) => i.id);
  assert.deepEqual(got, WARDROBE.filter((i) => i.level === 2).map((i) => i.id));
  assert.deepEqual(unlockedBetween(3, 3), []);
  assert.deepEqual(unlockedBetween(5, 2), []);
});

test('wear: sets a slot, tapping the same item takes it off, outfits are per pet', () => {
  const bonds = { mochi: { level: 9 } };
  let o = {};
  o = wear(o, 'mochi', 'party', bonds);
  assert.deepEqual(outfitFor(o, 'mochi'), { head: 'party', face: null });
  assert.deepEqual(outfitFor(o, 'pip'), { head: null, face: null });
  const before = o;
  o = wear(o, 'mochi', 'shades', bonds);
  assert.deepEqual(outfitFor(o, 'mochi'), { head: 'party', face: 'shades' });
  assert.deepEqual(outfitFor(before, 'mochi'), { head: 'party', face: null }, 'pure');
  o = wear(o, 'mochi', 'crown', bonds);
  assert.equal(outfitFor(o, 'mochi').head, 'crown', 'same slot replaces');
  o = wear(o, 'mochi', 'crown', bonds);
  assert.equal(outfitFor(o, 'mochi').head, null, 'second tap removes');
});

test('wear refuses locked or unknown items; outfitFor drops junk from storage', () => {
  const o = wear({}, 'mochi', 'wizard', { mochi: { level: 1 } });
  assert.deepEqual(o, {});
  assert.deepEqual(wear({}, 'mochi', 'nope', {}), {});
  assert.deepEqual(outfitFor({ mochi: { head: 'specs', face: '<img>' } }, 'mochi'), { head: null, face: null });
  assert.deepEqual(outfitFor('garbage', 'mochi'), { head: null, face: null });
});
