import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BACKDROPS, backdropById, backdropUrl, backdropLayout } from '../../phone/js/core/backdrops.js';

const covers = (l, W, H) => l.x <= 0.01 && l.y <= 0.01 && l.x + l.w >= W - 0.01 && l.y + l.h >= H - 0.01;

test('catalog starts with the plain pet colours and has files for the rest', () => {
  assert.equal(BACKDROPS[0].id, 'none');
  assert.equal(backdropUrl(BACKDROPS[0]), null);
  for (const b of BACKDROPS.slice(1)) {
    assert.match(backdropUrl(b), /^backdrops\/[a-z]+\.webp$/);
    assert.ok(b.floor > 0.5 && b.floor < 1, b.id);
  }
  assert.equal(backdropById('nope').id, 'none', 'unknown ids fall back safely');
});

test('the floor spot lands on the pet ground line when a little zoom allows it', () => {
  const b = { floor: 0.86 };
  const [W, H, ground] = [393, 852, 690];
  const l = backdropLayout(b, W, H, ground);
  assert.ok(covers(l, W, H), JSON.stringify(l));
  assert.ok(Math.abs(l.y + b.floor * l.h - ground) < 1, `floor at ${l.y + b.floor * l.h}`);
});

test('zoom is capped: it gets as close as it can and still covers the screen', () => {
  const b = { floor: 0.86 };
  const [W, H, ground] = [393, 852, 622];
  const l = backdropLayout(b, W, H, ground);
  assert.ok(covers(l, W, H));
  assert.ok(l.h <= (852 * 1.35) + 0.01, 'max zoom');
  const floorAt = l.y + b.floor * l.h;
  assert.ok(floorAt > ground && floorAt < 0.86 * 852, `closer than unzoomed (${floorAt})`);
});

test('landscape and plain layouts still cover', () => {
  for (const [W, H] of [[852, 393], [1024, 768], [393, 852]]) {
    assert.ok(covers(backdropLayout({ floor: 0.8 }, W, H, H * 0.8), W, H), `${W}x${H}`);
    assert.ok(covers(backdropLayout({}, W, H, H * 0.8), W, H), `${W}x${H} plain`);
  }
});
