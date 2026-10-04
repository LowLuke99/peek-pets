// Snacks: a little treat menu. Every pet has a favourite; chili is a joke for everyone
// except Ember. After a few snacks in a short while the pet is simply full and says
// "maybe later" (never sick, never sad). Pure functions; the app keeps `eaten` times.

export const SNACKS = Object.freeze([
  { id: 'berry', name: 'Strawberry', emoji: '🍓' },
  { id: 'cookie', name: 'Cookie', emoji: '🍪' },
  { id: 'onigiri', name: 'Rice ball', emoji: '🍙' },
  { id: 'icecream', name: 'Ice cream', emoji: '🍦' },
  { id: 'chili', name: 'Chili', emoji: '🌶️' },
].map((s) => Object.freeze(s)));

const FAVOURITES = Object.freeze({
  mochi: 'onigiri', // it is a rice cake, after all
  pip: 'cookie',
  nimbus: 'icecream',
  plum: 'berry',
  sprig: 'cookie',
  ember: 'chili',
  puff: 'icecream',
  bun: 'berry',
});

export const FULL_AFTER = 4;
export const FULL_WINDOW_MS = 10 * 60_000;

export const snackById = (id) => SNACKS.find((s) => s.id === id) ?? null;
export const favouriteOf = (petId) => FAVOURITES[petId] ?? null;

const recent = (eaten, now) => (Array.isArray(eaten) ? eaten : []).filter((t) => now - t < FULL_WINDOW_MS);

/** 'favourite' | 'yum' | 'spicy' | 'full' | null (unknown snack). */
export function snackOutcome(eaten, petId, snackId, now) {
  if (!snackById(snackId)) return null;
  if (recent(eaten, now).length >= FULL_AFTER) return 'full';
  if (favouriteOf(petId) === snackId) return 'favourite';
  return snackId === 'chili' ? 'spicy' : 'yum';
}

/** Feeds one snack: returns the outcome and the new list of recent snack times. */
export function eatSnack(eaten, petId, snackId, now) {
  const outcome = snackOutcome(eaten, petId, snackId, now);
  if (outcome === null || outcome === 'full') return { outcome, eaten };
  return { outcome, eaten: [...recent(eaten, now), now] };
}
