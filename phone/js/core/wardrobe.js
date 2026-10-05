// The wardrobe: hats, glasses and a bandana, bought with coins in the Shop (a couple
// are free). Slots: head, face, neck (one item each).
// Each pet keeps its own outfit. Pure functions; the app persists `outfits` and `owned`.

export const WARDROBE = Object.freeze([
  { id: 'bow', slot: 'head', name: 'Bow', price: 0 },
  { id: 'flower', slot: 'head', name: 'Blossom', price: 0 },
  { id: 'specs', slot: 'face', name: 'Round specs', price: 40 },
  { id: 'party', slot: 'head', name: 'Party hat', price: 40 },
  { id: 'bandana', slot: 'neck', name: 'Bandana', price: 50 },
  { id: 'catears', slot: 'head', name: 'Cat ears', price: 60 },
  { id: 'beanie', slot: 'head', name: 'Beanie', price: 60 },
  { id: 'heartglasses', slot: 'face', name: 'Heart glasses', price: 70 },
  { id: 'chef', slot: 'head', name: 'Chef hat', price: 70 },
  { id: 'shades', slot: 'face', name: 'Shades', price: 80 },
  { id: 'flowercrown', slot: 'head', name: 'Flower crown', price: 80 },
  { id: 'pirate', slot: 'head', name: 'Pirate hat', price: 90 },
  { id: 'santa', slot: 'head', name: 'Santa hat', price: 90 },
  { id: 'headphones', slot: 'head', name: 'Headphones', price: 90 },
  { id: 'cowboy', slot: 'head', name: 'Cowboy hat', price: 100 },
  { id: 'halo', slot: 'head', name: 'Halo', price: 100 },
  { id: 'monocle', slot: 'face', name: 'Monocle', price: 110 },
  { id: 'wizard', slot: 'head', name: 'Wizard hat', price: 120 },
  { id: 'viking', slot: 'head', name: 'Viking helmet', price: 130 },
  { id: 'crown', slot: 'head', name: 'Crown', price: 150 },
].map((i) => Object.freeze({ ...i, img: `img/wardrobe/${i.id}.webp` })));

export const SLOTS = Object.freeze(['head', 'face', 'neck']);
const EMPTY = Object.freeze({ head: null, face: null, neck: null });

export const itemById = (id) => WARDROBE.find((i) => i.id === id) ?? null;

/** Free items, or ones you've bought. */
export const isOwned = (item, owned) => Boolean(item) && (item.price === 0 || (Array.isArray(owned) && owned.includes(item.id)));

/** The outfit a pet is wearing, with anything unknown or misplaced dropped. */
export function outfitFor(outfits, petId) {
  const raw = outfits && typeof outfits === 'object' ? outfits[petId] : null;
  if (!raw || typeof raw !== 'object') return EMPTY;
  const valid = (slot) => (itemById(raw[slot])?.slot === slot ? raw[slot] : null);
  return { head: valid('head'), face: valid('face'), neck: valid('neck') };
}

/** Puts an item on (replacing that slot) or takes it off if it is already worn. */
export function wear(outfits, petId, itemId, owned) {
  const item = itemById(itemId);
  if (!item || !isOwned(item, owned)) return outfits;
  const current = outfitFor(outfits, petId);
  const next = { ...current, [item.slot]: current[item.slot] === item.id ? null : item.id };
  return { ...outfits, [petId]: next };
}

/**
 * Buys something from the Shop (any catalog entry with an id + price).
 * @returns {{owned: string[], wallet: object} | {error: 'owned'|'unknown'|'coins'}}
 */
export function buy(entry, owned, wallet) {
  if (!entry || !(entry.price >= 0)) return { error: 'unknown' };
  const list = Array.isArray(owned) ? owned : [];
  if (entry.price === 0 || list.includes(entry.id)) return { error: 'owned' };
  if (wallet.coins < entry.price) return { error: 'coins' };
  return { owned: [...list, entry.id], wallet: { ...wallet, coins: wallet.coins - entry.price } };
}

// Before v0.4 items unlocked by bond level instead of coins. On the first run after the
// update, everything you had stays yours: what pets wear, your backdrop, old unlocks.
const OLD_UNLOCK_LEVEL = { bow: 1, flower: 1, party: 2, specs: 2, beanie: 3, shades: 4, crown: 5, wizard: 6 };

export function migrateOwned(outfits, backdrop, oldLevel) {
  const ids = new Set();
  for (const o of Object.values(outfits && typeof outfits === 'object' ? outfits : {})) {
    for (const id of [o?.head, o?.face, o?.neck]) if (itemById(id)?.price > 0) ids.add(id);
  }
  for (const [id, lv] of Object.entries(OLD_UNLOCK_LEVEL)) if (lv <= oldLevel && itemById(id)?.price > 0) ids.add(id);
  if (backdrop && backdrop !== 'none' && backdrop !== 'bedroom') ids.add(backdrop);
  return [...ids];
}
