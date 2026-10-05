import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { WARDROBE } from '../../phone/js/core/wardrobe.js';
import { SNACKS } from '../../phone/js/core/snacks.js';
import { BACKDROPS, backdropUrl } from '../../phone/js/core/backdrops.js';
import { PHOTO_FRAMES, frameUrl } from '../../phone/js/core/photo.js';

const PHONE = join(import.meta.dirname, '..', '..', 'phone');
const shipped = (rel) => existsSync(join(PHONE, rel));

test('every wardrobe item, snack, backdrop and frame has its picture in phone/', () => {
  for (const i of WARDROBE) assert.ok(shipped(i.img), i.img);
  for (const s of SNACKS) assert.ok(shipped(s.img), s.img);
  for (const b of BACKDROPS.slice(1)) assert.ok(shipped(backdropUrl(b)), b.id);
  for (const f of PHOTO_FRAMES.slice(1)) assert.ok(shipped(frameUrl(f)), f.id);
});

test('ids are unique across each catalog', () => {
  for (const list of [WARDROBE, SNACKS, BACKDROPS, PHOTO_FRAMES]) {
    assert.equal(new Set(list.map((x) => x.id)).size, list.length);
  }
});
