import { test } from 'node:test';
import assert from 'node:assert/strict';

import { newCatch, stepCatch, CATCH } from '../../phone/js/games/catch.js';
import { newCups, cupsAt, pickCup, CUPS } from '../../phone/js/games/cups.js';

// Deterministic "random" for repeatable games.
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };

test('catch: a treat falling onto the pet is caught and scores', () => {
  let s = newCatch();
  s = { ...s, items: [{ id: 1, kind: 'berry', x: 0, y: CATCH.catchY - 0.02, vy: 1 }], spawnIn: 99 };
  const r = stepCatch(s, 0.05, { targetX: 0 }, seq(0.5));
  assert.equal(r.state.score, 1);
  assert.equal(r.state.items.length, 0);
  assert.deepEqual(r.events.map((e) => e.type), ['catch']);
  assert.equal(s.score, 0, 'pure');
});

test('catch: missed treats fall away, chili costs a life, stars are worth 3', () => {
  let s = { ...newCatch(), spawnIn: 99, items: [
    { id: 1, kind: 'berry', x: 1.0, y: CATCH.catchY - 0.01, vy: 1 },
    { id: 2, kind: 'chili', x: 0, y: CATCH.catchY - 0.01, vy: 1 },
    { id: 3, kind: 'star', x: 0.05, y: CATCH.catchY - 0.01, vy: 1 },
  ] };
  const r = stepCatch(s, 0.05, { targetX: 0 }, seq(0.5));
  const types = r.events.map((e) => e.type).sort();
  assert.deepEqual(types, ['catch', 'ouch']);
  assert.equal(r.state.lives, CATCH.lives - 1);
  assert.equal(r.state.score, 3);
  // The berry keeps falling past the pet and is dropped as a miss below the floor.
  let t = r.state;
  for (let i = 0; i < 40; i++) t = stepCatch(t, 0.05, { targetX: 0 }, seq(0.5)).state;
  assert.ok(!t.items.some((i) => i.id === 1));
});

test('catch: the pet glides toward the finger with a speed limit, inside the walls', () => {
  let s = newCatch();
  s = stepCatch(s, 0.1, { targetX: 5 }, seq(0.5)).state;
  assert.ok(s.petX > 0 && s.petX <= CATCH.petSpeed * 0.1 + 1e-9, String(s.petX));
  for (let i = 0; i < 100; i++) s = stepCatch(s, 0.1, { targetX: 5 }, seq(0.5)).state;
  assert.ok(Math.abs(s.petX - CATCH.halfWidth) < 1e-9);
});

test('catch: the round ends when time runs out or lives are gone, and gets harder over time', () => {
  let s = { ...newCatch(), lives: 1, spawnIn: 99, items: [{ id: 1, kind: 'chili', x: 0, y: CATCH.catchY - 0.01, vy: 1 }] };
  const r = stepCatch(s, 0.05, { targetX: 0 }, seq(0.5));
  assert.ok(r.state.over && r.events.some((e) => e.type === 'over'));
  let t = newCatch();
  const early = CATCH.spawnEvery(t);
  t = { ...t, time: CATCH.seconds - 2 };
  assert.ok(CATCH.spawnEvery(t) < early);
  const end = stepCatch({ ...newCatch(), time: CATCH.seconds - 0.01 }, 0.05, { targetX: 0 }, seq(0.5));
  assert.ok(end.state.over);
});

test('cups: the round lists swaps, the treat follows its cup, and picking reveals', () => {
  const r = newCups(1, seq(0.0, 0.5, 0.99, 0.3, 0.7));
  assert.equal(r.swaps.length, CUPS.swapsFor(1));
  assert.ok(r.swaps.every(([a, b]) => a !== b && a >= 0 && b < 3 && a < 3 && b >= 0));
  // Before shuffling every cup is in its own slot.
  assert.deepEqual(cupsAt(r, 0).map((c) => c.slot), [0, 1, 2]);
  // After all swaps, where is the treat's cup?
  const done = cupsAt(r, r.showFor + r.swaps.length * r.swapTime + 0.01);
  const slots = [0, 1, 2];
  for (const [a, b] of r.swaps) { const ia = slots.indexOf(a), ib = slots.indexOf(b); [slots[ia], slots[ib]] = [slots[ib], slots[ia]]; }
  assert.equal(done[r.treatCup].slot, slots[r.treatCup]);
  assert.equal(pickCup(r, done[r.treatCup].slot), true);
  assert.equal(pickCup(r, (done[r.treatCup].slot + 1) % 3), false);
});

test('cups: later levels are faster with more swaps; the pet stops peeking after level 3', () => {
  const a = newCups(1, seq(0.2, 0.6)), b = newCups(6, seq(0.2, 0.6));
  assert.ok(b.swaps.length > a.swaps.length && b.swapTime < a.swapTime);
  assert.equal(a.petPeeks, true);
  assert.equal(b.petPeeks, false);
  // Mid-swap the two moving cups are between their slots (and lifted apart).
  const mid = cupsAt(a, a.showFor + a.swapTime / 2);
  const [x, y] = a.swaps[0];
  const moving = mid.filter((c) => c.moving);
  assert.equal(moving.length, 2);
  assert.ok(moving.every((c) => c.x > Math.min(CUPS.slotX[x], CUPS.slotX[y]) - 1e-9 && c.x < Math.max(CUPS.slotX[x], CUPS.slotX[y]) + 1e-9));
});

import { newPop, stepPop, tapPop, POP, bubbleX } from '../../phone/js/games/pop.js';

test('pop: bubbles rise, taps pop them for points, rain clouds cost points (never below 0)', () => {
  let s = newPop();
  s = stepPop(s, 0.25, seq(0.5, 0.5, 0.5, 0.5, 0.5)).state; // spawns a treat bubble
  assert.equal(s.bubbles.length, 1);
  const b = s.bubbles[0];
  assert.ok(b.y < POP.startY, 'rising');
  const hit = tapPop(s, { x: bubbleX(b, s.time), y: b.y });
  assert.equal(hit.event.type, 'pop');
  assert.equal(hit.state.score, 1);
  assert.equal(hit.state.bubbles.length, 0);
  assert.equal(tapPop(s, { x: 5, y: 5 }).event, null, 'missing does nothing');
  const rain = { ...s, score: 1, bubbles: [{ ...b, kind: 'rain' }] };
  const wet = tapPop(rain, { x: bubbleX(b, s.time), y: b.y });
  assert.equal(wet.event.type, 'rain');
  assert.equal(wet.state.score, 0);
  const gold = tapPop({ ...s, bubbles: [{ ...b, kind: 'gold' }] }, { x: bubbleX(b, s.time), y: b.y });
  assert.equal(gold.state.score, 3);
});

test('pop: bubbles that float away are dropped; the round ends on time', () => {
  let s = { ...newPop(), spawnIn: 99, bubbles: [{ id: 1, kind: 'treat', x: 0, y: POP.goneY + 0.01, vy: -1, phase: 0 }] };
  s = stepPop(s, 0.1).state;
  assert.equal(s.bubbles.length, 0);
  const end = stepPop({ ...newPop(), time: POP.seconds - 0.01, spawnIn: 99 }, 0.05);
  assert.ok(end.state.over && end.events[0].type === 'over');
});
