// Maps PC cursor samples into eye-space gaze vectors (unit disc, +x = screen right,
// +y = down). Pure + deterministic so the mapping can be unit tested.

import { clamp } from './spring.js';

export const GAZE_MODES = ['mirror', 'left', 'right', 'below'];
export const SCREEN_MODES = ['all', 'current'];

// Where the phone sits relative to the desktop, in desktop-normalized units.
const PHONE_SPOTS = {
  left: { x: -0.18, y: 0.62 },
  right: { x: 1.18, y: 0.62 },
  below: { x: 0.5, y: 1.22 },
};

/** Soft clamp to the unit disc: linear until `knee`, then eases toward 1. */
export function softDisc(x, y, knee = 0.82) {
  const len = Math.hypot(x, y);
  if (len <= knee || len === 0) return { x, y };
  const over = len - knee;
  const room = 1 - knee;
  const eased = knee + room * Math.tanh(over / room);
  const k = eased / len;
  return { x: x * k, y: y * k };
}

/**
 * @param {{x:number,y:number,mx?:number,my?:number}} c normalized cursor (0..1)
 * @param {{mode?:string, screens?:string, aspect?:number}} [opts]
 * @returns {{x:number,y:number}} gaze in the unit disc
 */
export function cursorToGaze(c, opts = {}) {
  const mode = opts.mode ?? 'mirror';
  const useCurrent = opts.screens === 'current' && Number.isFinite(c.mx) && Number.isFinite(c.my);
  const px = clamp(useCurrent ? c.mx : c.x, 0, 1);
  const py = clamp(useCurrent ? c.my : c.y, 0, 1);

  if (mode === 'mirror' || !PHONE_SPOTS[mode]) {
    // Mirror: the pet faces you, so the cursor at your screen's right edge = eyes to the right.
    // Vertical range is slightly reduced; looking far up/down reads as rolling the eyes.
    return softDisc((px - 0.5) * 2.05, (py - 0.5) * 1.8);
  }

  // Physical: point from where the phone sits toward the cursor on the monitor.
  const aspect = clamp(opts.aspect ?? 16 / 9, 0.5, 6);
  const spot = PHONE_SPOTS[mode];
  const dx = (px - spot.x) * aspect;
  const dy = py - spot.y;
  const dist = Math.hypot(dx, dy) || 1;
  const reach = clamp(0.55 + dist * 0.28, 0.55, 1);
  return { x: (dx / dist) * reach, y: (dy / dist) * reach };
}

/** Finger/touch → gaze: direction from the face to the point, with reach by distance. */
export function pointToGaze(px, py, faceX, faceY, scale) {
  const dx = (px - faceX) / scale;
  const dy = (py - faceY) / scale;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return { x: 0, y: 0 };
  const reach = clamp(dist / 0.9, 0, 1);
  return softDisc((dx / dist) * reach, (dy / dist) * reach);
}

/**
 * Light dead-reckoning: extrapolate the cursor along its recent velocity to hide part
 * of the network delay. Only kicks in for steady motion, and never past `maxLeadMs`.
 */
export function predict(c, velocity, leadMs, maxLeadMs = 40) {
  const lead = clamp(leadMs, 0, maxLeadMs) / 1000;
  return {
    ...c,
    x: clamp(c.x + velocity.x * lead, 0, 1),
    y: clamp(c.y + velocity.y * lead, 0, 1),
    mx: Number.isFinite(c.mx) ? clamp(c.mx + velocity.mx * lead, 0, 1) : c.mx,
    my: Number.isFinite(c.my) ? clamp(c.my + velocity.my * lead, 0, 1) : c.my,
  };
}
