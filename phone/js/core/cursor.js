// Tracks the incoming PC cursor stream: velocity (for prediction), how long the eyes
// should keep "holding" the last position, and two playful gestures:
//   burst = a very fast flick, spin = circling the mouse around (makes the pet dizzy).

const HOLD_MS = 3500;
const ACTIVE_MS = 1200;
const BURST_SPEED = 3.2;        // desktop widths per second
const BURST_COOLDOWN_MS = 4000;
const SPIN_TURNS = 2.2;
const SPIN_MIN_SPEED = 0.7;

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class CursorTracker {
  constructor() {
    this.latest = null;
    this.lastAt = -Infinity;
    this.vel = { x: 0, y: 0, mx: 0, my: 0 };
    this.speed = 0;
    this.spin = 0;
    this.lastDir = null;
    this.lastBurst = -Infinity;
  }

  /** @returns {string[]} gesture events detected by this sample */
  push(c, now, aspect = 16 / 9) {
    const events = [];
    const prev = this.latest;
    const dt = (now - this.lastAt) / 1000;
    if (prev && dt > 0.001 && dt < 0.25) {
      const k = 0.45;
      const v = {
        x: (c.x - prev.x) / dt, y: (c.y - prev.y) / dt,
        mx: (c.mx - prev.mx) / dt, my: (c.my - prev.my) / dt,
      };
      this.vel = {
        x: this.vel.x + (v.x - this.vel.x) * k, y: this.vel.y + (v.y - this.vel.y) * k,
        mx: this.vel.mx + (v.mx - this.vel.mx) * k, my: this.vel.my + (v.my - this.vel.my) * k,
      };
      this.speed = Math.hypot(this.vel.x * aspect, this.vel.y) / aspect;

      if (this.speed > BURST_SPEED && now - this.lastBurst > BURST_COOLDOWN_MS) {
        this.lastBurst = now;
        events.push('burst');
      }
      if (this.speed > SPIN_MIN_SPEED) {
        const dir = Math.atan2(this.vel.y, this.vel.x * aspect);
        if (this.lastDir != null) this.spin += wrapAngle(dir - this.lastDir);
        this.lastDir = dir;
        if (Math.abs(this.spin) > SPIN_TURNS * Math.PI * 2) {
          this.spin = 0;
          events.push('spin');
        }
      } else {
        this.spin *= 0.9;
        this.lastDir = null;
      }
    }
    this.latest = c;
    this.lastAt = now;
    return events;
  }

  /** Called every frame: velocity dies off quickly once samples stop arriving. */
  decay(now) {
    if (now - this.lastAt > 60) {
      this.vel = { x: 0, y: 0, mx: 0, my: 0 };
      this.speed = 0;
    }
    if (now - this.lastAt > 800) this.spin = 0;
  }

  /** The cursor the eyes should look at right now, or null when attention has lapsed. */
  current(now) {
    if (!this.latest || now - this.lastAt > HOLD_MS) return null;
    return this.latest;
  }

  isActive(now) {
    return now - this.lastAt < ACTIVE_MS;
  }

  isFast(now) {
    return this.isActive(now) && this.speed > 1.6;
  }

  reset() {
    this.latest = null;
    this.lastAt = -Infinity;
    this.speed = 0;
  }
}

/** A pretend cursor for solo/demo mode: glides, pauses, darts, and sometimes circles. */
export class DemoCursor {
  constructor(rand = Math.random) {
    this.rand = rand;
    this.pos = { x: 0.5, y: 0.5 };
    this.vel = { x: 0, y: 0 };
    this.target = { x: 0.5, y: 0.5 };
    this.next = 0;
    this.mode = 'glide';
    this.circleUntil = 0;
    this.t = 0;
  }

  step(dt) {
    this.t += dt;
    const r = this.rand;
    if (this.t >= this.next) {
      const pick = r();
      this.mode = pick < 0.12 ? 'circle' : pick < 0.3 ? 'dart' : 'glide';
      if (this.mode === 'circle') this.circleUntil = this.t + 1.6;
      this.target = { x: 0.08 + r() * 0.84, y: 0.1 + r() * 0.8 };
      this.next = this.t + (this.mode === 'circle' ? 1.8 : 0.7 + r() * 1.9);
    }
    let tx = this.target.x, ty = this.target.y;
    if (this.mode === 'circle' && this.t < this.circleUntil) {
      const a = this.t * 7;
      tx = 0.5 + Math.cos(a) * 0.22;
      ty = 0.5 + Math.sin(a) * 0.3;
    }
    const omega = this.mode === 'dart' ? 16 : this.mode === 'circle' ? 22 : 6;
    const ax = omega * omega * (tx - this.pos.x) - 2 * omega * this.vel.x;
    const ay = omega * omega * (ty - this.pos.y) - 2 * omega * this.vel.y;
    this.vel = { x: this.vel.x + ax * dt, y: this.vel.y + ay * dt };
    this.pos = {
      x: Math.min(1, Math.max(0, this.pos.x + this.vel.x * dt)),
      y: Math.min(1, Math.max(0, this.pos.y + this.vel.y * dt)),
    };
    return { x: this.pos.x, y: this.pos.y, mx: this.pos.x, my: this.pos.y };
  }
}
