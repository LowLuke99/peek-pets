// Cup Shuffle: a treat goes under one of three cups, the cups shuffle, you pick one.
// The twist: your pet *peeks*: on early levels its eyes follow the right cup; from
// level 4 it gets too dizzy to help. Pure: a round is a plan (swaps + timing) and
// cupsAt(round, t) says where every cup is at time t.

export const CUPS = Object.freeze({
  slotX: [-0.62, 0, 0.62],
  showFor: 1.3,                                   // treat visible, then cups come down
  swapsFor: (level) => 3 + level * 2,
  swapTimeFor: (level) => Math.max(0.2, 0.62 - level * 0.07),
  peekUntil: 3,
});

/** @param {() => number} rand */
export function newCups(level, rand = Math.random) {
  const treatCup = Math.floor(rand() * 3) % 3;
  const swaps = [];
  for (let i = 0; i < CUPS.swapsFor(level); i++) {
    const a = Math.floor(rand() * 3) % 3;
    const b = (a + 1 + (Math.floor(rand() * 2) % 2)) % 3;
    swaps.push([a, b]);
  }
  return Object.freeze({ level, treatCup, swaps, swapTime: CUPS.swapTimeFor(level), showFor: CUPS.showFor, petPeeks: level <= CUPS.peekUntil });
}

const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);

/** 'show' | 'shuffle' | 'pick' */
export function phaseAt(round, t) {
  if (t < round.showFor) return 'show';
  if (t < round.showFor + round.swaps.length * round.swapTime) return 'shuffle';
  return 'pick';
}

/**
 * Where each cup is at time t: [{id, slot, x, y, lift, moving}] indexed by cup id.
 * `slot` is the cup's slot once the current swap lands. y is a small front/back offset
 * while two cups pass each other; lift raises the cups during the reveal at the start.
 */
export function cupsAt(round, t) {
  const slotOf = [0, 1, 2]; // cup id -> slot
  const inSlot = [0, 1, 2]; // slot -> cup id
  const k = Math.max(0, t - round.showFor) / round.swapTime;
  const done = Math.min(round.swaps.length, Math.floor(k));
  for (let i = 0; i < done; i++) swapSlots(round.swaps[i], slotOf, inSlot);
  const lift = t < round.showFor ? Math.sin(Math.min(1, t / round.showFor) * Math.PI) : 0;
  const cups = [0, 1, 2].map((id) => ({ id, slot: slotOf[id], x: CUPS.slotX[slotOf[id]], y: 0, lift, moving: false }));
  if (done < round.swaps.length && t >= round.showFor) {
    const [a, b] = round.swaps[done];
    const u = ease(k - done);
    const ca = inSlot[a], cb = inSlot[b];
    cups[ca] = { ...cups[ca], slot: b, x: CUPS.slotX[a] + (CUPS.slotX[b] - CUPS.slotX[a]) * u, y: -Math.sin(Math.PI * u) * 0.12, moving: true };
    cups[cb] = { ...cups[cb], slot: a, x: CUPS.slotX[b] + (CUPS.slotX[a] - CUPS.slotX[b]) * u, y: Math.sin(Math.PI * u) * 0.12, moving: true };
  }
  return cups;
}

function swapSlots([a, b], slotOf, inSlot) {
  const ca = inSlot[a], cb = inSlot[b];
  inSlot[a] = cb; inSlot[b] = ca;
  slotOf[ca] = b; slotOf[cb] = a;
}

/** Did picking `slot` find the treat? (after the shuffle) */
export function pickCup(round, slot) {
  const end = cupsAt(round, round.showFor + round.swaps.length * round.swapTime + 1);
  return end.find((c) => c.slot === slot)?.id === round.treatCup;
}
