// Coins and XP. XP (your player level) comes from playing games, not from tapping the
// pet: petting earns at most 1 XP per cooldown. Coins come from games (plus a daily
// first-game bonus) and buy things in the Shop. Pure; the app stores the wallet.

export const STARTER_COINS = 50;
export const DAILY_BONUS = 20;
export const INTERACT_COOLDOWN_MS = 20_000;
export const XP_PER_LEVEL = (level) => 50 + 30 * level;

/** Per game: score → { coins, xp }. Coins are capped per round. */
const REWARDS = {
  catch: (s) => ({ coins: Math.min(60, s), xp: s * 2 }),
  cups: (rounds) => ({ coins: Math.min(60, rounds * 6), xp: rounds * 12 }),
  pop: (s) => ({ coins: Math.min(60, Math.floor(s / 2)), xp: s }),
};

/** Old per-pet bond hearts become starting XP so nobody loses progress. */
export function newWallet(bonds = {}) {
  const xp = Math.max(0, ...Object.values(bonds ?? {}).map((b) => Math.floor(Number(b?.hearts) || 0)));
  return { coins: STARTER_COINS, xp, lastDaily: null, lastInteract: 0 };
}

export function levelInfo(xp) {
  let level = 1, floor = 0;
  while (xp >= floor + XP_PER_LEVEL(level)) { floor += XP_PER_LEVEL(level); level++; }
  const need = XP_PER_LEVEL(level);
  return { level, progress: (xp - floor) / need, toNext: floor + need - xp };
}

/** Petting/tapping: 1 XP, then nothing until the cooldown passes. */
export function interactXp(wallet, now) {
  const since = now - (wallet.lastInteract ?? 0);
  if (since >= 0 && since < INTERACT_COOLDOWN_MS) return { wallet, gained: 0 }; // (clock moved back: treat as expired)
  return { wallet: { ...wallet, xp: wallet.xp + 1, lastInteract: now }, gained: 1 };
}

const dayOf = (t) => new Date(t).toDateString();

export function gameReward(wallet, game, score, now) {
  const rule = REWARDS[game];
  if (!rule) return { wallet, coins: 0, xp: 0, daily: false, leveledUp: false, level: levelInfo(wallet.xp).level };
  const base = rule(Math.max(0, Math.floor(score)));
  const daily = dayOf(now) !== wallet.lastDaily;
  const coins = base.coins + (daily ? DAILY_BONUS : 0);
  const before = levelInfo(wallet.xp).level;
  const next = { ...wallet, coins: wallet.coins + coins, xp: wallet.xp + base.xp, lastDaily: daily ? dayOf(now) : wallet.lastDaily };
  const level = levelInfo(next.xp).level;
  return { wallet: next, coins, xp: base.xp, daily, leveledUp: level > before, level };
}

/** The wallet after paying `price`, or null if you can't afford it. */
export function spend(wallet, price) {
  if (!(price >= 0) || wallet.coins < price) return null;
  return { ...wallet, coins: wallet.coins - price };
}
