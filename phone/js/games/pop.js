// Bubble Pop: bubbles float up past your pet; tap to pop them. Treat bubbles +1,
// golden +3, rain clouds −2. 30-second rounds, bubbles come faster as it goes.
// Pure: stepPop(state, dt, rand, halfWidth) and tapPop(state, point).

export const POP = Object.freeze({
  seconds: 30,
  r: 0.13,
  startY: 0.35,
  goneY: -2.3,
  spawnEvery: (s) => 0.55 - 0.3 * Math.min(1, s.time / 30),
  values: { treat: 1, gold: 3, rain: -2 },
});

const TREATS = ['berry', 'cookie', 'onigiri', 'icecream', 'donut', 'cupcake', 'pancakes', 'watermelon', 'dumpling', 'taiyaki', 'boba'];

export function newPop() {
  return Object.freeze({ time: 0, score: 0, pops: 0, bubbles: [], spawnIn: 0.2, nextId: 1, over: false });
}

export function stepPop(state, dt, rand = Math.random, halfWidth = 0.6) {
  if (state.over) return { state, events: [] };
  const s = { ...state, time: state.time + dt, spawnIn: state.spawnIn - dt };
  let bubbles = state.bubbles;
  if (s.spawnIn <= 0) {
    const r = rand();
    const kind = r < 0.12 ? 'rain' : r < 0.2 ? 'gold' : 'treat';
    const speed = 0.45 + rand() * 0.35 + 0.5 * Math.min(1, s.time / POP.seconds);
    bubbles = [...bubbles, { id: s.nextId, kind, treat: TREATS[Math.floor(rand() * TREATS.length)], x: (rand() * 2 - 1) * halfWidth, y: POP.startY, vy: -speed, phase: rand() * 6.28 }];
    s.nextId += 1;
    s.spawnIn = POP.spawnEvery(s);
  }
  s.bubbles = bubbles.map((b) => ({ ...b, y: b.y + b.vy * dt })).filter((b) => b.y > POP.goneY);
  const events = [];
  if (s.time >= POP.seconds) {
    s.over = true;
    events.push({ type: 'over', score: s.score });
  }
  return { state: s, events };
}

/** Pops the bubble under the finger (if any). x wobbles with time, like it's drawn. */
export function tapPop(state, p) {
  if (state.over) return { state, event: null };
  let hit = null, best = Infinity;
  for (const b of state.bubbles) {
    const d = Math.hypot(p.x - bubbleX(b, state.time), p.y - b.y);
    if (d < POP.r * 1.35 && d < best) { best = d; hit = b; }
  }
  if (!hit) return { state, event: null };
  const value = POP.values[hit.kind];
  return {
    state: { ...state, score: Math.max(0, state.score + value), pops: state.pops + 1, bubbles: state.bubbles.filter((b) => b !== hit) },
    event: { type: hit.kind === 'rain' ? 'rain' : 'pop', kind: hit.kind, value, x: bubbleX(hit, state.time), y: hit.y },
  };
}

export const bubbleX = (b, t) => b.x + Math.sin(t * 2.2 + b.phase) * 0.05;
