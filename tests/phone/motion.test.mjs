import { test } from 'node:test';
import assert from 'node:assert/strict';

import { initialShake, shakeStep, SHAKE, screenGravity, smoothTilt } from '../../phone/js/core/motion.js';

const feed = (state, samples) => {
  let s = state;
  const hits = [];
  for (const [a, t] of samples) {
    const r = shakeStep(s, a, t);
    s = r.state;
    if (r.shook) hits.push(t);
  }
  return { state: s, hits };
};

test('three hard jolts close together are a shake; then a cooldown', () => {
  const still = { x: 0, y: -9.8, z: 0 };
  const jolt = { x: 25, y: -9.8, z: 0 };
  const seq = [];
  let t = 0;
  for (let i = 0; i < 4; i++) { seq.push([still, t += 50], [jolt, t += 50]); }
  const { state, hits } = feed(initialShake(), seq);
  assert.equal(hits.length, 1, `hits at ${hits}`);
  const again = feed(state, [[still, t + 100], [jolt, t + 150], [still, t + 200], [jolt, t + 250], [still, t + 300], [jolt, t + 350]]);
  assert.equal(again.hits.length, 0, 'cooldown');
  const later = t + SHAKE.cooldownMs + 1000;
  const after = feed(again.state, [[still, later], [jolt, later + 50], [still, later + 100], [jolt, later + 150], [still, later + 200]]);
  assert.equal(after.hits.length, 1);
});

test('gentle movement and slow jolts are not a shake', () => {
  const seq = [];
  for (let i = 0; i < 40; i++) seq.push([{ x: Math.sin(i) * 3, y: -9.8, z: 0 }, i * 50]);
  assert.equal(feed(initialShake(), seq).hits.length, 0);
  const slow = [[{ x: 0, y: 0, z: 0 }, 0], [{ x: 25, y: 0, z: 0 }, 1000], [{ x: 0, y: 0, z: 0 }, 2000], [{ x: 25, y: 0, z: 0 }, 3000]];
  assert.equal(feed(initialShake(), slow).hits.length, 0, 'jolts too far apart');
  assert.equal(shakeStep(initialShake(), null, 0).shook, false, 'missing data is ignored');
});

test('screen gravity: flat = none, upright = down, right side lowered = right', () => {
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  let g = screenGravity(0, 0, 0);
  assert.ok(near(g.x, 0) && near(g.y, 0));
  g = screenGravity(90, 0, 0);
  assert.ok(near(g.x, 0) && near(g.y, 1));
  g = screenGravity(0, 30, 0);
  assert.ok(near(g.x, 0.5) && near(g.y, 0));
  // Landscape (rotated 90°): the device's "down the screen" axis is now sideways.
  g = screenGravity(90, 0, 90);
  assert.ok(near(Math.abs(g.x), 1) && near(g.y, 0), JSON.stringify(g));
  assert.deepEqual(screenGravity(null, undefined, 0), { x: 0, y: 0 });
});

test('tilt smoothing eases toward the target and ignores tiny tilts', () => {
  let s = { x: 0, y: 0 };
  for (let i = 0; i < 60; i++) s = smoothTilt(s, { x: 0.6, y: 0.9 }, 1 / 60);
  assert.ok(s.x > 0.4 && s.x <= 0.6, String(s.x));
  const dead = smoothTilt({ x: 0, y: 0 }, { x: 0.04, y: 0.5 }, 10);
  assert.equal(dead.x, 0, 'dead zone');
});
