// The wardrobe: hats and glasses the pet can wear. Items unlock with bond levels
// (the best level across all pets, so switching pets never takes anything away) and
// each pet keeps its own outfit. Pure functions; app.js persists the outfits map.

export const WARDROBE = Object.freeze([
  { id: 'bow', slot: 'head', name: 'Bow', level: 1 },
  { id: 'flower', slot: 'head', name: 'Blossom', level: 1 },
  { id: 'party', slot: 'head', name: 'Party hat', level: 2 },
  { id: 'specs', slot: 'face', name: 'Round specs', level: 2 },
  { id: 'beanie', slot: 'head', name: 'Beanie', level: 3 },
  { id: 'shades', slot: 'face', name: 'Shades', level: 4 },
  { id: 'crown', slot: 'head', name: 'Crown', level: 5 },
  { id: 'wizard', slot: 'head', name: 'Wizard hat', level: 6 },
].map((i) => Object.freeze(i)));

const EMPTY = Object.freeze({ head: null, face: null });

export const itemById = (id) => WARDROBE.find((i) => i.id === id) ?? null;

export function bestLevel(bonds) {
  if (!bonds || typeof bonds !== 'object') return 1;
  return Math.max(1, ...Object.values(bonds).map((b) => Number(b?.level) || 1));
}

export const isUnlocked = (item, bonds) => Boolean(item) && bestLevel(bonds) >= item.level;

/** Items that become wearable when the best level goes from `from` to `to`. */
export function unlockedBetween(from, to) {
  return WARDROBE.filter((i) => i.level > from && i.level <= to);
}

/** The outfit a pet is wearing, with anything unknown or misplaced dropped. */
export function outfitFor(outfits, petId) {
  const raw = outfits && typeof outfits === 'object' ? outfits[petId] : null;
  if (!raw || typeof raw !== 'object') return EMPTY;
  const valid = (slot) => (itemById(raw[slot])?.slot === slot ? raw[slot] : null);
  return { head: valid('head'), face: valid('face') };
}

/** Puts an item on (replacing that slot) or takes it off if it is already worn. */
export function wear(outfits, petId, itemId, bonds) {
  const item = itemById(itemId);
  if (!item || !isUnlocked(item, bonds)) return outfits;
  const current = outfitFor(outfits, petId);
  const next = { ...current, [item.slot]: current[item.slot] === item.id ? null : item.id };
  return { ...outfits, [petId]: next };
}
