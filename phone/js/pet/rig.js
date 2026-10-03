// The animation rig: turns "what the pet feels" + "where it should look" into a
// per-frame pose that species renderers draw. Layers (each on its own spring/timer):
//   gaze (fast) → head lean (slower, overshoots) → body squash/hop/dance → breathing
//   + blinks (scheduled, with saccade-linked blinks) + facial expression blending.

import { stepSpring, stepSpring2, clamp, smoothstep } from '../core/spring.js';
import { NEUTRAL, expressionFor, blendExpression } from '../core/expressions.js';

const GAZE_OMEGA = { cursor: 44, touch: 40, toy: 38, idle: 30, sleepy: 10 };
const LEAN = { omega: 8.5, zeta: 0.58 };
const SQUASH = { omega: 21, zeta: 0.24 };
const GRAVITY = 10;
const BLINK = { close: 0.07, hold: 0.04, open: 0.13 };
const SLEEPY_BLINK = { close: 0.14, hold: 0.12, open: 0.3 };

export class PetRig {
  constructor(rand = Math.random) {
    this.rand = rand;
    this.t = 0;
    this.gaze = { x: 0, y: 0, vx: 0, vy: 0 };
    this.lean = { x: 0, y: 0, vx: 0, vy: 0 };
    this.expr = { ...NEUTRAL };
    this.squash = { x: 0, v: 0 };
    this.hop = { y: 0, vy: 0, windup: 0, power: 0 };
    this.blinks = [];            // start times of active blinks
    this.nextBlink = 1.2;
    this.lastBlink = -10;
    this.wink = { L: 0, R: 0 };
    this.idle = { tx: 0, ty: 0, next: 0, mx: 0, my: 0, nextMicro: 0 };
    this.lastTarget = { x: 0, y: 0 };
    this.dance = { start: -1, until: -1, bpm: 112 };
    this.purr = 0;
    this.emotion = 'neutral';
  }

  // ---- one-shot actions ------------------------------------------------------
  boop(strength = 1) {
    this.squash = { x: this.squash.x - 0.16 * strength, v: this.squash.v - 1.2 * strength };
  }

  hopUp(power = 1) {
    if (this.hop.y > 0.001 || this.hop.windup > 0) return;
    this.hop = { ...this.hop, windup: 0.09, power };
    this.squash = { x: this.squash.x - 0.1 * power, v: this.squash.v };
  }

  blinkNow(double = false) {
    this.blinks = [...this.blinks, this.t];
    if (double) this.blinks = [...this.blinks, this.t + 0.24];
    this.lastBlink = this.t;
  }

  winkEye(side) {
    this.wink = { ...this.wink, [side]: 1 };
  }

  startDance(ms, bpm = 112) {
    this.dance = { start: this.t, until: this.t + ms / 1000, bpm };
  }

  stopDance() {
    this.dance = { ...this.dance, until: -1 };
  }

  petting() {
    this.purr = 1;
  }

  get dancing() {
    return this.t < this.dance.until;
  }

  // ---- per-frame update ------------------------------------------------------
  /**
   * @param {number} dt seconds
   * @param {{emotion: string, gazeTarget: {x:number,y:number}|null, source?: string, reducedMotion?: boolean}} input
   */
  update(dt, input) {
    dt = Math.min(dt, 0.1);
    this.t += dt;
    const t = this.t;
    const calm = input.reducedMotion ? 0.3 : 1;
    this.emotion = input.emotion;

    // Expression
    this.expr = blendExpression(this.expr, expressionFor(input.emotion), dt);
    const e = this.expr;
    const sleepy = e.energy < 0.3;

    // Gaze: explicit target (cursor/touch/toy) or the idle "look around" brain.
    const target = input.gazeTarget ?? this.idleGaze(input.emotion, calm);
    const source = input.gazeTarget ? input.source ?? 'cursor' : 'idle';
    const jump = Math.hypot(target.x - this.lastTarget.x, target.y - this.lastTarget.y);
    if (jump > 0.7 && t - this.lastBlink > 0.9 && this.rand() < 0.3) this.blinkNow();
    this.lastTarget = target;
    const omega = sleepy ? GAZE_OMEGA.sleepy : GAZE_OMEGA[source] ?? GAZE_OMEGA.idle;
    const micro = source === 'idle' ? this.microSaccade(calm) : { x: 0, y: 0 };
    this.gaze = stepSpring2(this.gaze, target.x + micro.x, target.y + micro.y, omega, 1, dt);
    this.lean = stepSpring2(this.lean, this.gaze.x * 0.9, this.gaze.y * 0.55, LEAN.omega, LEAN.zeta, dt);

    // Blinks
    if (t >= this.nextBlink) {
      const surprisedHold = input.emotion === 'surprised' ? 0.8 : 0;
      this.blinkNow(this.rand() < 0.15);
      this.nextBlink = t + surprisedHold + (sleepy ? 3.5 : 1.6) + this.rand() * (sleepy ? 3 : 4.2);
    }
    const timing = sleepy ? SLEEPY_BLINK : BLINK;
    const total = timing.close + timing.hold + timing.open;
    this.blinks = this.blinks.filter((s) => t - s < total + 0.05);
    const blinkL = this.blinkAmount(t, timing);
    const blinkR = this.blinkAmount(t - 0.012, timing); // a hair of asymmetry reads as organic
    this.wink = { L: this.wink.L * Math.exp(-5 * dt), R: this.wink.R * Math.exp(-5 * dt) };

    // Squash & stretch spring, hop physics
    this.squash = stepSpring(this.squash, 0, SQUASH.omega, SQUASH.zeta, dt);
    this.stepHop(dt);
    this.purr = Math.max(0, this.purr - dt * 1.6);

    // Dance
    let danceY = 0, danceRot = 0, danceSquash = 0;
    if (this.dancing) {
      const beat = ((t - this.dance.start) * this.dance.bpm) / 60;
      const ph = beat % 1;
      const fade = smoothstep(0, 0.3, t - this.dance.start) * smoothstep(0, 0.4, this.dance.until - t);
      danceY = -Math.abs(Math.sin(Math.PI * beat)) * 0.07 * fade * calm;
      danceRot = Math.sin(Math.PI * beat) * 0.11 * fade * calm;
      danceSquash = (ph < 0.15 ? (0.15 - ph) / 0.15 : 0) * 0.07 * fade * calm;
    }

    // Breathing + idle sway
    const period = 2.8 + (1 - e.energy) * 2;
    const breath = Math.sin((2 * Math.PI * t) / period);
    const sway = (Math.sin(t * 0.63) * 0.014 + Math.sin(t * 1.37) * 0.006) * calm;
    const airStretch = clamp(-this.hop.vy * 0.035, -0.06, 0.12);
    const sq = this.squash.x * (input.reducedMotion ? 0.5 : 1) - danceSquash;
    const purrWiggle = this.purr * Math.sin(t * 38) * 0.012 * calm;

    return {
      t,
      emotion: input.emotion,
      x: this.lean.x * 0.045 * calm,
      y: -this.hop.y + danceY + (1 - e.energy) * 0.012 + breath * 0.004,
      rot: this.lean.x * 0.075 * calm + sway + danceRot + purrWiggle,
      sx: 1 - sq * 0.6 - breath * 0.007 - airStretch * 0.4,
      sy: 1 + sq + breath * 0.013 + airStretch,
      hop: this.hop.y,
      gaze: { x: this.gaze.x, y: this.gaze.y },
      lean: { x: this.lean.x, y: this.lean.y },
      eyeL: clamp(e.open * (1 - blinkL) * (1 - this.wink.L), 0, 1.35),
      eyeR: clamp(e.open * (1 - blinkR) * (1 - this.wink.R), 0, 1.35),
      lower: e.lower,
      pupil: e.pupil,
      happy: e.happy,
      tilt: e.tilt,
      smile: e.smile,
      mouthOpen: e.mouthOpen + (this.dancing ? 0.15 : 0),
      mouthO: e.mouthO,
      blush: e.blush,
      brow: e.brow,
      dizzy: e.dizzy,
      sparkle: e.sparkle,
      energy: e.energy,
      breath,
      purr: this.purr,
      dancing: this.dancing,
      speed: Math.hypot(this.lean.vx, this.lean.vy),
      calm,
    };
  }

  blinkAmount(t, timing) {
    let amount = 0;
    for (const start of this.blinks) {
      const dt = t - start;
      if (dt < 0) continue;
      let v = 0;
      if (dt < timing.close) v = (dt / timing.close) ** 2;
      else if (dt < timing.close + timing.hold) v = 1;
      else {
        const p = (dt - timing.close - timing.hold) / timing.open;
        v = p >= 1 ? 0 : (1 - p) ** 2; // ease-out: lids snap open, then settle
      }
      amount = Math.max(amount, v);
    }
    return amount;
  }

  stepHop(dt) {
    let { y, vy, windup, power } = this.hop;
    if (windup > 0) {
      windup -= dt;
      if (windup <= 0) {
        vy = 2.5 * power;
        this.squash = { x: this.squash.x + 0.12 * power, v: this.squash.v + 1.5 };
      }
    }
    if (y > 0 || vy > 0) {
      y += vy * dt;
      vy -= GRAVITY * dt;
      if (y <= 0) {
        y = 0;
        const impact = Math.min(1, -vy / 3);
        vy = 0;
        this.squash = { x: this.squash.x - 0.14 * impact, v: this.squash.v - 1 * impact };
      }
    }
    this.hop = { y, vy, windup, power };
  }

  /** Where the eyes wander when nothing in particular holds their attention. */
  idleGaze(emotion, calm) {
    const t = this.t;
    const r = this.rand;
    if (emotion === 'asleep') return { x: 0, y: 0.25 };
    if (t >= this.idle.next) {
      let tx = 0, ty = 0, hold = 0.7 + r() * 2.2;
      if (emotion === 'waiting') {
        const pick = r();
        // "Where did my PC go?" — glance toward the status chip, then scan around.
        if (pick < 0.35) { tx = 0.72; ty = -0.72; hold = 1.2 + r(); }
        else if (pick < 0.75) { tx = r() < 0.5 ? -0.85 : 0.85; ty = -0.05 + r() * 0.2; }
      } else if (emotion === 'sleepy') {
        tx = (r() - 0.5) * 0.5; ty = 0.15 + r() * 0.2; hold = 2 + r() * 2.5;
      } else if (r() < 0.38) {
        tx = (r() - 0.5) * 0.12; ty = (r() - 0.5) * 0.1; // look at you
      } else {
        const a = r() * Math.PI * 2;
        const d = 0.35 + r() * 0.45;
        tx = Math.cos(a) * d; ty = Math.sin(a) * d * 0.65;
      }
      this.idle = { ...this.idle, tx: tx * (0.4 + 0.6 * calm), ty: ty * (0.4 + 0.6 * calm), next: t + hold };
    }
    return { x: this.idle.tx, y: this.idle.ty };
  }

  microSaccade(calm) {
    if (calm < 1) return { x: 0, y: 0 };
    if (this.t >= this.idle.nextMicro) {
      this.idle = {
        ...this.idle,
        mx: (this.rand() - 0.5) * 0.05,
        my: (this.rand() - 0.5) * 0.04,
        nextMicro: this.t + 0.25 + this.rand() * 0.5,
      };
    }
    return { x: this.idle.mx, y: this.idle.my };
  }
}
