import { test } from 'node:test';
import assert from 'node:assert/strict';

import { photoCrop, photoDate, photoFileName } from '../../phone/js/core/photo.js';

test('crop is a square around the pet, kept inside the canvas', () => {
  const c = photoCrop({ x: 390, y: 500 }, 300, 2, { w: 780 * 2, h: 1688 * 2 });
  assert.equal(c.w, c.h);
  assert.ok(c.w > 300 * 2 * 1.5, 'room for hats and props');
  assert.ok(c.x >= 0 && c.y >= 0);
  assert.ok(c.x + c.w <= 1560 && c.y + c.h <= 3376);
  // Pet centre stays roughly central horizontally.
  assert.ok(Math.abs(c.x + c.w / 2 - 780) < 2);
});

test('crop shrinks to fit small canvases and clamps at edges', () => {
  const c = photoCrop({ x: 10, y: 10 }, 400, 1, { w: 300, h: 500 });
  assert.equal(c.w, 300);
  assert.equal(c.x, 0);
  assert.equal(c.y, 0);
});

test('caption date and file name are friendly and safe', () => {
  const d = new Date(2026, 9, 4, 13, 5);
  assert.equal(photoDate(d), '4 Oct 2026');
  assert.equal(photoFileName('Mochi', d), 'peek-pets-mochi-2026-10-04-1305.png');
  assert.equal(photoFileName('<b>x', d), 'peek-pets-bx-2026-10-04-1305.png');
});
