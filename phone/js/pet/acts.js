// One-shot "performances" layered on top of the rig: stretch, yawn, look far away,
// wave, point, alarm shake, and eating (aah → chew, or a polite "nope"). Each has a
// smooth envelope (so it eases in and out of whatever the pet was doing) and
// overrides a few pose/face channels while it plays.

import { smoothstep } from '../core/spring.js';

export const ACTS = Object.freeze({
  stretch: { dur: 2.8, rise: 0.5, fall: 0.6 },
  yawn: { dur: 2.1, rise: 0.45, fall: 0.5 },
  lookFar: { dur: 20, rise: 0.8, fall: 0.8 },
  wave: { dur: 2.4, rise: 0.3, fall: 0.4 },
  point: { dur: 2.6, rise: 0.25, fall: 0.4 },
  shake: { dur: 1.3, rise: 0.05, fall: 0.3 },
  aah: { dur: 0.7, rise: 0.15, fall: 0.08 },
  chew: { dur: 1.7, rise: 0.08, fall: 0.3 },
  nope: { dur: 1.1, rise: 0.15, fall: 0.3 },
});

/** Returns a new acts map with `name` (re)started at time t. */
export function startAct(acts, name, t, dur) {
  const spec = ACTS[name];
  if (!spec) return acts;
  return { ...acts, [name]: { start: t, until: t + (dur ?? spec.dur) } };
}

export function stopAct(acts, name, t) {
  const a = acts[name];
  if (!a) return acts;
  return { ...acts, [name]: { ...a, until: Math.min(a.until, t + ACTS[name].fall) } };
}

/** Envelope 0..1 for every running act; expired ones are dropped. */
export function actLevels(acts, t) {
  const levels = {};
  const alive = {};
  for (const [name, a] of Object.entries(acts)) {
    if (t >= a.until) continue;
    const spec = ACTS[name];
    alive[name] = a;
    levels[name] = smoothstep(0, spec.rise, t - a.start) * smoothstep(0, spec.fall, a.until - t);
  }
  return { levels, alive };
}

/**
 * Applies act overrides to the rig's output pose (and its face channels) in place
 * on a fresh object. `lv` = levels from actLevels.
 */
export function applyActs(pose, lv, t) {
  const p = { ...pose };
  const st = lv.stretch ?? 0;
  if (st > 0) {
    const reach = smoothstep(0.2, 0.8, st);
    p.sy *= 1 + 0.17 * reach;
    p.sx *= 1 - 0.08 * reach;
    p.rot += Math.sin(t * 7) * 0.035 * reach;
    p.happy = Math.max(p.happy, reach * 0.95);
    p.mouthO = Math.max(p.mouthO, reach * 0.45);
    p.reach = reach;
  }
  const yw = lv.yawn ?? 0;
  if (yw > 0) {
    p.mouthO = Math.max(p.mouthO, yw);
    p.eyeL *= 1 - 0.82 * yw;
    p.eyeR *= 1 - 0.82 * yw;
    p.sy *= 1 + 0.06 * yw;
    p.rot += -0.05 * yw;
    p.brow = p.brow * (1 - yw) - 0.3 * yw;
  }
  const far = lv.lookFar ?? 0;
  if (far > 0) {
    p.pupil *= 1 - 0.18 * far;
    p.eyeL = Math.max(p.eyeL, 1.08 * far + p.eyeL * (1 - far));
    p.eyeR = Math.max(p.eyeR, 1.08 * far + p.eyeR * (1 - far));
    p.smile = p.smile * (1 - far) + 0.3 * far;
    p.far = far;
  }
  const wv = lv.wave ?? 0;
  if (wv > 0) {
    p.wave = wv;
    p.rot += 0.05 * wv;
    p.smile = Math.max(p.smile, 0.9 * wv);
    p.mouthOpen = Math.max(p.mouthOpen, 0.3 * wv);
  }
  const pt = lv.point ?? 0;
  if (pt > 0) p.point = pt;
  const sh = lv.shake ?? 0;
  if (sh > 0) {
    p.x += Math.sin(t * 58) * 0.018 * sh;
    p.rot += Math.sin(t * 47) * 0.04 * sh;
    p.eyeL = Math.max(p.eyeL, 1.2 * sh);
    p.eyeR = Math.max(p.eyeR, 1.2 * sh);
    p.mouthO = Math.max(p.mouthO, 0.7 * sh);
  }
  const aah = lv.aah ?? 0;
  if (aah > 0) {
    p.mouthO = Math.max(p.mouthO, aah);
    p.eyeL = Math.max(p.eyeL, 1.12 * aah);
    p.eyeR = Math.max(p.eyeR, 1.12 * aah);
    p.sy *= 1 + 0.04 * aah;
  }
  const chew = lv.chew ?? 0;
  if (chew > 0) {
    const munch = Math.abs(Math.sin(t * 11));
    p.mouthO *= 1 - chew;
    p.mouthOpen = p.mouthOpen * (1 - chew) + munch * 0.32 * chew;
    p.smile = Math.max(p.smile, 0.7 * chew);
    p.happy = Math.max(p.happy, 0.85 * chew);
    p.blush = Math.max(p.blush ?? 0, 0.8 * chew);
    p.sx *= 1 + (0.035 + munch * 0.025) * chew; // puffed cheeks
    p.sy *= 1 - munch * 0.025 * chew;
  }
  const nope = lv.nope ?? 0;
  if (nope > 0) {
    p.rot += Math.sin(t * 13) * 0.07 * nope;
    p.x += Math.sin(t * 13) * 0.012 * nope;
    p.happy = Math.max(p.happy, 0.6 * nope);
    p.smile = Math.max(p.smile, 0.4 * nope);
  }
  return p;
}

/** Where the eyes rest while "looking far away": up and off to one side, drifting slowly. */
export function farGaze(t, start) {
  const u = t - start;
  return { x: -0.62 + Math.sin(u * 0.35) * 0.12, y: -0.48 + Math.sin(u * 0.27 + 1) * 0.06 };
}
