import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  newWallet, levelInfo, interactXp, gameReward, spend, INTERACT_COOLDOWN_MS, DAILY_BONUS, STARTER_COINS,
} from '../../phone/js/core/economy.js';

const T0 = Date.parse('2026-10-04T10:00:00');

test('a new wallet starts with a few coins; old bond hearts carry over as XP', () => {
  const w = newWallet({ mochi: { hearts: 30 }, pip: { hearts: 80 } });
  assert.equal(w.coins, STARTER_COINS);
  assert.equal(w.xp, 80);
  assert.equal(newWallet(null).xp, 0);
});

test('levels need more XP each time', () => {
  assert.deepEqual(levelInfo(0).level, 1);
  const l2 = levelInfo(80);
  assert.equal(l2.level, 2);
  assert.ok(levelInfo(1000).level > l2.level);
  assert.ok(levelInfo(79).progress > 0.9 && levelInfo(79).progress < 1);
});

test('petting gives at most 1 XP per cooldown: spamming the pet earns nothing extra', () => {
  let w = newWallet();
  let r = interactXp(w, T0);
  assert.equal(r.gained, 1);
  w = r.wallet;
  for (let i = 1; i < 50; i++) { r = interactXp(w, T0 + i * 100); w = r.wallet; assert.equal(r.gained, 0); }
  assert.equal(interactXp(w, T0 + INTERACT_COOLDOWN_MS + 1).gained, 1);
});

test('games pay coins + XP by score, with a daily first-game bonus', () => {
  const w = newWallet();
  const a = gameReward(w, 'catch', 20, T0);
  assert.equal(a.coins, 20 + DAILY_BONUS);
  assert.equal(a.daily, true);
  assert.equal(a.xp, 40);
  assert.equal(a.wallet.coins, STARTER_COINS + 20 + DAILY_BONUS);
  const b = gameReward(a.wallet, 'cups', 3, T0 + 60_000);
  assert.equal(b.daily, false);
  assert.equal(b.coins, 18);
  const c = gameReward(b.wallet, 'pop', 0, T0 + 86_400_000);
  assert.equal(c.daily, true, 'next day: bonus again');
  assert.equal(gameReward(w, 'catch', 9999, T0).coins, 60 + DAILY_BONUS, 'capped per round');
  assert.equal(gameReward(w, 'nope', 5, T0).coins, 0);
  assert.equal(w.coins, STARTER_COINS, 'pure');
});

test('a level-up is reported', () => {
  const r = gameReward({ ...newWallet(), xp: 75 }, 'catch', 10, T0);
  assert.equal(r.leveledUp, true);
  assert.equal(r.level, 2);
});

test('spending: only what you have', () => {
  const w = { ...newWallet(), coins: 50 };
  assert.equal(spend(w, 30).coins, 20);
  assert.equal(spend(w, 51), null);
  assert.equal(spend(w, -5), null);
});
