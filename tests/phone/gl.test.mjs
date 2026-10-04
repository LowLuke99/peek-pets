import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  multiply, translation, rotation, scaling, apply, scaleOf, normalMatrix, linear, PartBuilder, partOnScreen, SHAPES, MODES, MATERIALS, IDENTITY,
} from '../../phone/js/gl/parts.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test('affine helpers behave like canvas transforms', () => {
  // translate then rotate 90°: local (1,0) → (10,20) + (0,1)
  const m = multiply(translation(10, 20), rotation(Math.PI / 2));
  const p = apply(m, 1, 0);
  near(p.x, 10); near(p.y, 21);
  near(scaleOf(multiply(scaling(3, 2), rotation(0.7))), Math.sqrt(6));
  assert.deepEqual(multiply(IDENTITY, translation(1, 2)), [1, 0, 0, 1, 1, 2]);
});

test('normal matrix keeps directions, removes scale', () => {
  const n = normalMatrix(scaling(400)); // uniform zoom: identity for normals
  near(n[0], 1); near(n[3], 1); near(n[1], 0); near(n[2], 0);
  // Squash: a gradient pointing along local x stays along screen x.
  const s = normalMatrix(scaling(400, 200));
  const gx = { x: s[0] * 1 + s[2] * 0, y: s[1] * 1 + s[3] * 0 };
  near(gx.y, 0);
  assert.ok(gx.x > 0);
});

test('colours convert to linear light', () => {
  assert.deepEqual(linear('#000000'), [0, 0, 0]);
  near(linear('#ffffff')[0], 1);
  near(linear('#808080')[1], 0.2158605, 1e-6);
  assert.equal(linear('#fff'), linear('#fff'));
});

test('builder records parts under the current transform with materials', () => {
  const b = new PartBuilder().reset(scaling(100));
  b.save();
  b.translate(1, 0);
  const part = b.blob({ w: 1, h: 0.8, nTop: 2, nBottom: 3 }, 'clay');
  b.restore();
  const e = b.ellipse({ rx: 0.2, ry: 0.1 }, { base: 'jelly', color: '#abcdef' });
  assert.equal(b.parts.length, 2);
  assert.equal(part.shape, SHAPES.blob);
  assert.equal(part.mode, MODES.dome);
  assert.equal(part.m[4], 100); // translated by 1 unit at 100 px/unit
  assert.equal(e.m[4], 0);      // restore() undid it
  assert.equal(e.mat.wrap, MATERIALS.jelly.wrap);
  assert.equal(e.mat.color, '#abcdef');
  assert.ok(part.box.hx > 0.5, 'box padded for anti-aliasing');
  assert.equal(part.params.length, 16);
});

test('polygons are pulled in by their rounding and carry their vertex count', () => {
  const b = new PartBuilder().reset(scaling(100));
  const tri = [{ x: 0, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }];
  const p = b.poly(tri, 0.2, 'vinyl');
  assert.equal(p.shape, SHAPES.poly);
  assert.equal(p.params[12], 3);
  near(p.params[13], 0.12);
  assert.ok(Math.abs(p.params[1]) < 1, 'top vertex moved toward the centre');
});

test('balls and shadows', () => {
  const b = new PartBuilder().reset(scaling(100));
  const balls = b.balls(Array.from({ length: 12 }, (_, i) => ({ x: i * 0.1, y: 0, r: 0.1 })), 0.05, 'cloud');
  assert.equal(balls.circles.length, 8, 'capped at 8 for the shader');
  const sh = b.shadow({ rx: 0.4, ry: 0.1 });
  assert.equal(sh.mode, MODES.shadow);
});

test('off-screen parts are culled', () => {
  const b = new PartBuilder().reset(scaling(100));
  const on = b.ellipse({ x: 1, y: 1, rx: 0.2, ry: 0.2 }, 'clay');
  const off = b.ellipse({ x: 50, y: 50, rx: 0.2, ry: 0.2 }, 'clay');
  assert.equal(partOnScreen(on, 300, 300), true);
  assert.equal(partOnScreen(off, 300, 300), false);
});
