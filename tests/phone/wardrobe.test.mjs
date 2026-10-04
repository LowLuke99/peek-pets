import { test } from 'node:test';
import assert from 'node:assert/strict';

import { WARDROBE, isOwned, wear, outfitFor, itemById, buy } from '../../phone/js/core/wardrobe.js';

test('catalog: unique ids, known slots, a couple of free items, prices otherwise', () => {
  const ids = new Set(WARDROBE.map((i) => i.id));
  assert.equal(ids.size, WARDROBE.length);
  for (const i of WARDROBE) assert.ok(['head', 'face'].includes(i.slot) && i.price >= 0, i.id);
  assert.ok(WARDROBE.filter((i) => i.price === 0).length >= 2, 'something to wear from the start');
  assert.ok(Object.isFrozen(WARDROBE));
});

test('free items are owned from the start; bought ones after buying', () => {
  assert.equal(isOwned(itemById('bow'), []), true);
  assert.equal(isOwned(itemById('crown'), []), false);
  assert.equal(isOwned(itemById('crown'), ['crown']), true);
});

test('buying spends coins once and refuses what you already have or can\'t afford', () => {
  const crown = itemById('crown');
  const r = buy(crown, [], { coins: 200 });
  assert.deepEqual(r.owned, ['crown']);
  assert.equal(r.wallet.coins, 200 - crown.price);
  assert.equal(buy(crown, r.owned, r.wallet).error, 'owned');
  assert.equal(buy(itemById('bow'), [], { coins: 0 }).error, 'owned');
  assert.equal(buy(crown, [], { coins: crown.price - 1 }).error, 'coins');
  assert.equal(buy(null, [], { coins: 999 }).error, 'unknown');
});

test('wear: sets a slot, tapping the same item takes it off, outfits are per pet', () => {
  const owned = ['party', 'shades', 'crown'];
  let o = {};
  o = wear(o, 'mochi', 'party', owned);
  assert.deepEqual(outfitFor(o, 'mochi'), { head: 'party', face: null });
  assert.deepEqual(outfitFor(o, 'pip'), { head: null, face: null });
  const before = o;
  o = wear(o, 'mochi', 'shades', owned);
  assert.deepEqual(outfitFor(o, 'mochi'), { head: 'party', face: 'shades' });
  assert.deepEqual(outfitFor(before, 'mochi'), { head: 'party', face: null }, 'pure');
  o = wear(o, 'mochi', 'crown', owned);
  assert.equal(outfitFor(o, 'mochi').head, 'crown', 'same slot replaces');
  o = wear(o, 'mochi', 'crown', owned);
  assert.equal(outfitFor(o, 'mochi').head, null, 'second tap removes');
});

test('wear refuses items you don\'t own; outfitFor drops junk from storage', () => {
  assert.deepEqual(wear({}, 'mochi', 'wizard', []), {});
  assert.deepEqual(wear({}, 'mochi', 'nope', []), {});
  assert.deepEqual(outfitFor({ mochi: { head: 'specs', face: '<img>' } }, 'mochi'), { head: null, face: null });
  assert.deepEqual(outfitFor('garbage', 'mochi'), { head: null, face: null });
});
