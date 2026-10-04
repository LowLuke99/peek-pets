// Secondary motion for appendages (antennas, ears, fins, tails). Each appendage is
// an angular spring that gets kicked by the body's motion, so it lags, overshoots
// and settles: the follow-through that makes a character feel physical.

import { stepSpring } from '../core/spring.js';

/** Body motion since the last frame. Returns [motion, nextTracker]. */
export function trackMotion(tracker, pose, dt) {
  const prev = tracker ?? { rot: pose.rot, x: pose.x, y: pose.y, vx: 0, vy: 0 };
  const safe = Math.max(dt, 1 / 240);
  const vx = (pose.x - prev.x) / safe;
  const vy = (pose.y - prev.y) / safe;
  const motion = {
    dRot: (pose.rot - prev.rot) / safe,
    vx, vy,
    ax: (vx - prev.vx) / safe,
    ay: (vy - prev.vy) / safe,
  };
  return [motion, { rot: pose.rot, x: pose.x, y: pose.y, vx, vy }];
}

/**
 * @param {{a:number, v:number}} s angle state
 * @param {number} target rest angle
 * @param {number} kick angular velocity impulse this frame
 */
export function stepAppendage(s, target, kick, dt, omega = 13, zeta = 0.28) {
  const next = stepSpring({ x: s.a, v: s.v + kick }, target, omega, zeta, dt);
  return { a: next.x, v: next.v };
}

export const appendage = (a = 0) => ({ a, v: 0 });
