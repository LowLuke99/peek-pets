// Facial expression presets. Each emotion is a set of target values for the face rig;
// the rig eases every channel toward the target at its own speed, so switching
// emotions always morphs smoothly instead of popping.

export const NEUTRAL = Object.freeze({
  open: 1,        // eyelid openness (0 closed .. 1 normal .. 1.3 wide)
  lower: 0,       // lower lid raise (smiling eyes / squint)
  pupil: 1,       // pupil + iris scale
  happy: 0,       // 0..1 morph into ^ ^ arc eyes
  tilt: 0,        // lid tilt: + determined, - worried
  smile: 0.35,    // mouth curve: -1 frown .. 1 big smile
  mouthOpen: 0,   // 0 closed .. 1 wide open
  mouthO: 0,      // 0..1 round "o" mouth
  blush: 0.12,
  brow: 0,        // brow raise (species with brows)
  dizzy: 0,       // spiral eyes
  sparkle: 0,     // star highlights
  energy: 0.5,    // drives body bounce/glow (0 sleepy .. 1 hyped)
});

const preset = (p) => Object.freeze({ ...NEUTRAL, ...p });

export const EXPRESSIONS = Object.freeze({
  neutral: NEUTRAL,
  curious: preset({ open: 1.06, pupil: 1.1, smile: 0.25, mouthO: 0.18, brow: 0.35, energy: 0.65 }),
  focused: preset({ open: 0.9, lower: 0.18, pupil: 0.96, tilt: 0.12, smile: 0.2, energy: 0.7 }),
  happy: preset({ open: 0.92, lower: 0.28, pupil: 1.14, smile: 1, mouthOpen: 0.38, blush: 0.5, energy: 0.8, brow: 0.2 }),
  joy: preset({ happy: 1, smile: 1, mouthOpen: 0.78, blush: 0.75, energy: 1, brow: 0.45, sparkle: 0.6 }),
  love: preset({ happy: 1, smile: 0.85, mouthOpen: 0.22, blush: 1, energy: 0.75 }),
  surprised: preset({ open: 1.28, pupil: 0.74, smile: 0, mouthO: 0.95, blush: 0.15, brow: 1, energy: 0.9 }),
  sleepy: preset({ open: 0.32, lower: 0.12, pupil: 1.06, tilt: -0.04, smile: 0.15, mouthO: 0.24, blush: 0.22, brow: -0.1, energy: 0.15 }),
  asleep: preset({ open: 0, smile: 0.18, mouthO: 0.28, blush: 0.25, energy: 0.05, brow: -0.1 }),
  waiting: preset({ open: 0.97, pupil: 1.12, tilt: -0.22, smile: 0.02, blush: 0.1, brow: -0.25, energy: 0.4 }),
  worried: preset({ open: 1.02, pupil: 1.08, tilt: -0.45, smile: -0.35, blush: 0.08, brow: -0.6, energy: 0.45 }),
  dizzy: preset({ dizzy: 1, smile: -0.05, mouthOpen: 0.32, blush: 0.3, energy: 0.6, brow: 0.3 }),
  wince: preset({ open: 0.85, lower: 0.2, tilt: -0.2, smile: -0.2, mouthO: 0.55, blush: 0.35, brow: -0.4, energy: 0.6 }),
  proud: preset({ open: 0.82, lower: 0.32, smile: 0.9, mouthOpen: 0.15, blush: 0.4, brow: 0.5, sparkle: 0.4, energy: 0.8 }),
});

export const EMOTIONS = Object.keys(EXPRESSIONS);

// Easing rates (1/s) per channel: lids and mouth snap, blush and energy drift.
export const RATES = Object.freeze({
  open: 15, lower: 11, pupil: 8, happy: 13, tilt: 9, smile: 11, mouthOpen: 16, mouthO: 16,
  blush: 4, brow: 11, dizzy: 5, sparkle: 6, energy: 2.5,
});

export function expressionFor(name) {
  return EXPRESSIONS[name] ?? NEUTRAL;
}

/** Eases every channel of `current` toward `target`; returns a new object. */
export function blendExpression(current, target, dt, speed = 1) {
  const next = {};
  for (const key of Object.keys(NEUTRAL)) {
    const rate = RATES[key] * speed;
    next[key] = target[key] + (current[key] - target[key]) * Math.exp(-rate * dt);
  }
  return next;
}
