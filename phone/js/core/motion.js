// Phone motion: shake detection from accelerometer jolts, and tilt → which way is
// "downhill" on the screen (so the pet leans and the ball rolls). Pure functions; the
// app feeds devicemotion / deviceorientation samples in.

export const SHAKE = Object.freeze({
  jolt: 14,          // m/s² change between samples that counts as a jolt
  count: 3,          // jolts needed…
  windowMs: 900,     // …within this long
  cooldownMs: 2500,  // then ignore shaking for a bit
});

const TILT_DEAD = 0.08;
const TILT_RATE = 5;
const DEG = Math.PI / 180;

export function initialShake() {
  return Object.freeze({ last: null, jolts: [], until: 0 });
}

/**
 * @param {{x:number,y:number,z:number}|null} a accelerationIncludingGravity (m/s²)
 * @returns {{state: object, shook: boolean}}
 */
export function shakeStep(state, a, now) {
  if (!a || ![a.x, a.y, a.z].every(Number.isFinite)) return { state, shook: false };
  const prev = state.last;
  const delta = prev ? Math.hypot(a.x - prev.x, a.y - prev.y, a.z - prev.z) : 0;
  let jolts = state.jolts.filter((t) => now - t < SHAKE.windowMs);
  if (delta >= SHAKE.jolt && now >= state.until) jolts = [...jolts, now];
  if (jolts.length >= SHAKE.count) {
    return { state: { last: a, jolts: [], until: now + SHAKE.cooldownMs }, shook: true };
  }
  return { state: { ...state, last: a, jolts }, shook: false };
}

/**
 * Gravity projected onto the screen, from deviceorientation beta/gamma (degrees) and
 * the screen rotation (0/90/180/270). x > 0: downhill is to the right; y > 0: toward
 * the bottom of the screen. Length ≤ 1 (0 when the phone lies flat).
 */
export function screenGravity(beta, gamma, angle = 0) {
  if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return { x: 0, y: 0 };
  const b = beta * DEG, g = gamma * DEG;
  const dx = Math.cos(b) * Math.sin(g); // device axes: x right, y toward the bottom edge
  const dy = Math.sin(b);
  const r = -(Number(angle) || 0) * DEG;
  const x = dx * Math.cos(r) - dy * Math.sin(r);
  const y = dx * Math.sin(r) + dy * Math.cos(r);
  return { x: clean(x), y: clean(y) };
}

const clean = (v) => (Math.abs(v) < 1e-9 ? 0 : v);

/** Eases the tilt the pet reacts to toward the sensor's, with a small dead zone. */
export function smoothTilt(current, target, dt) {
  const k = 1 - Math.exp(-TILT_RATE * dt);
  const tx = Math.abs(target.x) < TILT_DEAD ? 0 : target.x;
  return { x: current.x + (tx - current.x) * k, y: current.y + (target.y - current.y) * k };
}
