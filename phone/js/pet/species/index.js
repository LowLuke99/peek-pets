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

export const SPECIES = [mochi, pip, nimbus, plum, sprig, ember, puff, bun];

export function getSpecies(id) {
  return SPECIES.find((s) => s.id === id) ?? SPECIES[0];
}
