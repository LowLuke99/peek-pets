import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SPECIES, getSpecies } from '../../phone/js/pet/species/index.js';
import { PartBuilder, scaling, MAX_BALLS } from '../../phone/js/gl/parts.js';

const NEW_IDS = ['bloop', 'bao', 'mallow', 'cap'];

/** A rig-shaped pose with sensible defaults (see pet/rig.js). */
function pose(over = {}) {
  return {
    t: 1.3, emotion: 'neutral', x: 0, y: 0, rot: 0, sx: 1, sy: 1, hop: 0,
    gaze: { x: 0, y: 0 }, lean: { x: 0, y: 0 }, eyeL: 1, eyeR: 1, lower: 0, pupil: 1,
    happy: 0, tilt: 0, smile: 0.3, mouthOpen: 0, mouthO: 0, blush: 0.3, brow: 0, dizzy: 0,
    sparkle: 0, energy: 0.7, breath: 0, purr: 0, dancing: false, speed: 0, calm: 1,
    reach: 0, far: 0, wave: 0, point: 0, bop: false, ...over,
  };
}

/** Runs a species' physics for a while under one pose. */
function settle(species, p, seconds = 2) {
  let s = species.init();
  for (let i = 0; i < seconds * 60; i++) s = species.step ? species.step(s, { ...p, t: p.t + i / 60 }, 1 / 60) : s;
  return s;
}

/** A canvas context that accepts every call (enough to run the 2D draw paths). */
function fakeCtx() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'createRadialGradient' || key === 'createLinearGradient') return () => gradient;
      return () => {};
    },
    set(target, key, value) { target[key] = value; return true; },
  });
}

test('the four newest pets are registered and are the only ones tagged NEW', () => {
  const ids = SPECIES.map((s) => s.id);
  for (const id of NEW_IDS) assert.ok(ids.includes(id), id);
  assert.deepEqual(SPECIES.filter((s) => s.isNew).map((s) => s.id), NEW_IDS);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  assert.equal(getSpecies('bao').name, 'Bao');
});

test('new pets have everything the app and wardrobe expect', () => {
  for (const id of NEW_IDS) {
    const s = getSpecies(id);
    assert.ok(s.name && s.blurb, id);
    for (const k of ['bgA', 'bgB', 'accent', 'pedestal']) assert.match(s.palette[k], /^#[0-9A-F]{6}$/i, `${id} ${k}`);
    assert.ok(s.grounded ? s.groundY > 0 : s.floatY > 0, `${id} placement`);
    assert.ok(s.hit.rx > 0 && s.hit.ry > 0, id);
    assert.ok(s.face.lx < 0 && s.face.rx > 0 && s.face.r > 0, id);
    assert.ok(Number.isFinite(s.propFit.hat.y), `${id} hat anchor`);
    assert.ok(s.lines.hello.length >= 2 && s.lines.snackFav.length >= 1, id);
    for (const fn of ['init', 'step', 'gl', 'draw', 'drawFace']) assert.equal(typeof s[fn], 'function', `${id}.${fn}`);
  }
});

test('new pets build finite GL parts in every mood', () => {
  const moods = [pose(), pose({ emotion: 'joy', happy: 1, smile: 1, mouthOpen: 0.6 }), pose({ emotion: 'sleepy', energy: 0.1, eyeL: 0.3, eyeR: 0.3 }),
    pose({ emotion: 'surprised', mouthO: 0.95, energy: 0.9 }), pose({ dancing: true, wave: 1, lean: { x: 0.8, y: -0.3 } })];
  for (const id of NEW_IDS) {
    const species = getSpecies(id);
    for (const p of moods) {
      const b = new PartBuilder().reset(scaling(300));
      species.gl(b, p, settle(species, p, 1));
      assert.ok(b.parts.length >= 3 && b.parts.length < 60, `${id}: ${b.parts.length} parts`);
      for (const part of b.parts) {
        assert.ok(part.params.every(Number.isFinite), `${id} params`);
        assert.ok(!part.circles || part.circles.length <= MAX_BALLS, `${id} balls`);
        assert.ok(Object.values(part.box).every(Number.isFinite), `${id} box`);
      }
    }
  }
});

test('the classic 2D paths run without throwing', () => {
  for (const id of NEW_IDS) {
    const species = getSpecies(id);
    const p = pose({ emotion: 'joy', happy: 1 });
    const s = settle(species, p, 0.5);
    assert.doesNotThrow(() => species.draw(fakeCtx(), p, s), id);
    assert.doesNotThrow(() => species.drawFace(fakeCtx(), p, s), id);
  }
});

test('Bloop puffs up when surprised and deflates when sleepy', () => {
  const bloop = getSpecies('bloop');
  const calm = settle(bloop, pose()).puff.a;
  const shocked = settle(bloop, pose({ emotion: 'surprised', mouthO: 0.95 })).puff.a;
  const sleepy = settle(bloop, pose({ energy: 0.1 })).puff.a;
  assert.ok(shocked > calm + 0.3, `${shocked} vs ${calm}`);
  assert.ok(sleepy < calm - 0.2, `${sleepy} vs ${calm}`);
});

test('ambient particles only use known kinds', () => {
  const kinds = new Set(['bubble', 'steam', 'sparkle']);
  for (const id of NEW_IDS) {
    const species = getSpecies(id);
    if (!species.ambient) continue;
    const emitted = [];
    const particles = { emit: (kind) => emitted.push(kind) };
    for (let i = 0; i < 600; i++) species.ambient(particles, pose({ happy: 1 }), 1 / 30, { x: 0, y: -0.5 });
    assert.ok(emitted.length > 0, id);
    assert.ok(emitted.every((k) => kinds.has(k)), `${id}: ${[...new Set(emitted)]}`);
  }
});
