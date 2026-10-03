// Spring + smoothing primitives. Pure functions: they return new state and never
// mutate their inputs, so they're trivially testable and safe to call from anywhere.

/** @typedef {{ x: number, v: number }} Spring1 */

export const spring = (x = 0, v = 0) => ({ x, v });

/**
 * Advances a damped spring analytically (exact solution, stable for any dt).
 * omega = natural frequency (rad/s), zeta = damping ratio (1 = critical, <1 = bouncy).
 * @param {Spring1} s
 * @returns {Spring1}
 */
export function stepSpring(s, target, omega, zeta, dt) {
  if (dt <= 0) return s;
  const d = s.x - target;
  if (zeta >= 0.999) {
    const e = Math.exp(-omega * dt);
    const c = s.v + omega * d;
    return { x: target + (d + c * dt) * e, v: (s.v - omega * c * dt) * e };
  }
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  const e = Math.exp(-zeta * omega * dt);
  const c2 = (s.v + zeta * omega * d) / wd;
  const cos = Math.cos(wd * dt);
  const sin = Math.sin(wd * dt);
  return {
    x: target + e * (d * cos + c2 * sin),
    v: e * ((c2 * wd - zeta * omega * d) * cos - (d * wd + zeta * omega * c2) * sin),
  };
}

/** 2-D convenience wrapper around two independent springs. */
export function stepSpring2(s, tx, ty, omega, zeta, dt) {
  const nx = stepSpring({ x: s.x, v: s.vx }, tx, omega, zeta, dt);
  const ny = stepSpring({ x: s.y, v: s.vy }, ty, omega, zeta, dt);
  return { x: nx.x, y: ny.x, vx: nx.v, vy: ny.v };
}

/** Frame-rate independent exponential approach toward target. rate = 1/seconds. */
export const approach = (x, target, rate, dt) => target + (x - target) * Math.exp(-rate * dt);

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const easeOutBack = (t) => {
  const c = 1.70158;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};
