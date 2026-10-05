// Treat Catch: treats rain down and you slide your pet (drag anywhere) to catch them.
// Stars are worth 3, chilies cost a life; 30-second rounds that speed up as they go.
// Pure: stepCatch(state, dt, input, rand) -> { state, events }. Stage units (pet ≈ 1 wide,
// ground at y = 0, up is negative).

export const CATCH = Object.freeze({
  seconds: 30,
  lives: 3,
  catchY: -0.5,      // mouth height the treats must pass
  catchR: 0.32,      // how close (x) counts as caught
  halfWidth: 0.9,    // the pet can slide this far either way
  petSpeed: 3.2,     // stage units / s
  startY: -1.75,
  goneY: 0.3,
  spawnEvery: (s) => 0.85 - 0.5 * progress(s),
  fallSpeed: (s) => 0.85 + 0.95 * progress(s),
});

const TREATS = ['berry', 'cookie', 'onigiri', 'icecream', 'donut', 'cupcake', 'pancakes', 'watermelon', 'dumpling', 'taiyaki', 'boba'];

function progress(s) {
  return Math.min(1, Math.max(0, s.time / CATCH.seconds));
}

export function newCatch() {
  return Object.freeze({ time: 0, score: 0, lives: CATCH.lives, combo: 0, best: 0, petX: 0, items: [], spawnIn: 0.4, nextId: 1, over: false });
}

function spawn(s, rand, hw) {
  const r = rand();
  const kind = r < 0.15 ? 'chili' : r < 0.22 ? 'star' : TREATS[Math.floor(rand() * TREATS.length)];
  const x = (rand() * 2 - 1) * hw;
  return { id: s.nextId, kind, x, y: CATCH.startY, vy: CATCH.fallSpeed(s) * (kind === 'star' ? 1.25 : 1) };
}

/**
 * @param {{targetX: number|null}} input where the finger wants the pet (stage x), or null
 * @param {() => number} rand
 */
export function stepCatch(state, dt, input, rand = Math.random) {
  if (state.over) return { state, events: [] };
  const events = [];
  let s = { ...state, time: state.time + dt };

  const hw = input?.halfWidth ?? CATCH.halfWidth; // the visible play area (screen-dependent)
  if (input?.targetX != null) {
    const target = Math.min(hw, Math.max(-hw, input.targetX));
    const step = Math.min(Math.abs(target - s.petX), CATCH.petSpeed * dt);
    s.petX = s.petX + Math.sign(target - s.petX) * step;
  }

  s.spawnIn -= dt;
  let items = s.items;
  if (s.spawnIn <= 0) {
    items = [...items, spawn(s, rand, hw)];
    s.nextId += 1;
    s.spawnIn = CATCH.spawnEvery(s);
  }

  const kept = [];
  for (const it of items) {
    const y = it.y + it.vy * dt;
    const crossed = it.y < CATCH.catchY && y >= CATCH.catchY;
    if (crossed && Math.abs(it.x - s.petX) < CATCH.catchR) {
      if (it.kind === 'chili') {
        s.lives -= 1;
        s.combo = 0;
        events.push({ type: 'ouch', x: it.x, kind: it.kind });
      } else {
        s.combo += 1;
        s.score += it.kind === 'star' ? 3 : 1;
        events.push({ type: 'catch', x: it.x, kind: it.kind, combo: s.combo });
      }
      continue;
    }
    if (y > CATCH.goneY) {
      if (it.kind !== 'chili') { s.combo = 0; events.push({ type: 'miss', x: it.x, kind: it.kind }); }
      continue;
    }
    kept.push({ ...it, y });
  }
  s.items = kept;

  if (s.lives <= 0 || s.time >= CATCH.seconds) {
    s.over = true;
    events.push({ type: 'over', score: s.score });
  }
  return { state: s, events };
}
