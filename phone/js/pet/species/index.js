// Pet registry. To add a pet, create a species module with the same shape as
// mochi.js (palette, face layout, hit area, draw) and list it here.

import { mochi } from './mochi.js';

export const SPECIES = [mochi];

export function getSpecies(id) {
  return SPECIES.find((s) => s.id === id) ?? SPECIES[0];
}
