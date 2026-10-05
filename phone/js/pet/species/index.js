// Pet registry. To add a pet, create a species module with the same shape as
// mochi.js (palette, face layout, hit area, draw, optional step/ambient/lines) and
// list it here. Order = order in the picker.

import { mochi } from './mochi.js';
import { pip } from './pip.js';
import { nimbus } from './nimbus.js';
import { plum } from './plum.js';
import { sprig } from './sprig.js';
import { ember } from './ember.js';
import { puff } from './puff.js';
import { bun } from './bun.js';
import { inky } from './inky.js';
import { pebble } from './pebble.js';
import { lumi } from './lumi.js';
import { opal } from './opal.js';
import { bloop } from './bloop.js';
import { bao } from './bao.js';
import { mallow } from './mallow.js';
import { cap } from './cap.js';
import { zoe } from './zoe.js';

// Only the latest batch wears the NEW tag in the picker (older modules may still carry
// `isNew: true` from their own launch; this list is the source of truth).
const NEW_PETS = new Set(['zoe']);

export const SPECIES = Object.freeze([mochi, pip, nimbus, plum, sprig, ember, puff, bun, inky, pebble, lumi, opal, bloop, bao, mallow, cap, zoe]
  .map((s) => (Boolean(s.isNew) === NEW_PETS.has(s.id) ? s : { ...s, isNew: NEW_PETS.has(s.id) })));

export function getSpecies(id) {
  return SPECIES.find((s) => s.id === id) ?? SPECIES[0];
}
