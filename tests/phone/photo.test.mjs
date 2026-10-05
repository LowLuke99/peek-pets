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

test('frames: the photo covers the whole window and stays centred on it', async () => {
  const { PHOTO_FRAMES, framedLayout, frameById, frameUrl } = await import('../../phone/js/core/photo.js');
  assert.equal(PHOTO_FRAMES[0].id, 'polaroid');
  assert.equal(frameUrl(PHOTO_FRAMES[0]), null);
  assert.equal(frameById('nope').id, 'polaroid');
  for (const f of PHOTO_FRAMES.slice(1)) {
    const L = framedLayout(f, 1080);
    assert.equal(L.H, Math.round(1080 / f.aspect), f.id);
    const { win, photo } = L;
    assert.ok(photo.x <= win.x + 0.01 && photo.y <= win.y + 0.01, `${f.id} starts before the window`);
    assert.ok(photo.x + photo.size >= win.x + win.w - 0.01 && photo.y + photo.size >= win.y + win.h - 0.01, `${f.id} reaches past it`);
    assert.ok(Math.abs(photo.x + photo.size / 2 - (win.x + win.w / 2)) < 0.01, `${f.id} centred`);
    assert.match(frameUrl(f), /^img\/frames\/[a-z]+\.webp$/);
  }
});
