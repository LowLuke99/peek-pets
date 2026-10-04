// Shake & tilt: listens to the phone's motion sensors (only while the setting is on).
// Shaking makes the pet dizzy; tilting makes it lean and slide a little downhill and
// rolls the ball. iOS needs a permission tap first (Settings → Shake & tilt).

import { initialShake, shakeStep, screenGravity, smoothTilt } from '../core/motion.js';

const SLIDE = 0.16;
const LEAN = 0.12;

export class MotionSense {
  constructor({ onShake }) {
    this.onShake = onShake;
    this.on = false;
    this.shake = initialShake();
    this.target = { x: 0, y: 0 };
    this.tilt = { x: 0, y: 0 };
    this.onMotion = (e) => this.motion(e);
    this.onOrient = (e) => this.orient(e);
  }

  static get supported() {
    return typeof window !== 'undefined' && 'DeviceMotionEvent' in window;
  }

  /** Must be called from a tap on iOS (permission prompt). Resolves to true when listening. */
  async enable() {
    if (this.on) return true;
    if (!MotionSense.supported) return false;
    try {
      for (const Ev of [window.DeviceMotionEvent, window.DeviceOrientationEvent]) {
        if (typeof Ev?.requestPermission === 'function' && (await Ev.requestPermission()) !== 'granted') return false;
      }
    } catch {
      return false;
    }
    window.addEventListener('devicemotion', this.onMotion);
    window.addEventListener('deviceorientation', this.onOrient);
    this.on = true;
    return true;
  }

  disable() {
    window.removeEventListener('devicemotion', this.onMotion);
    window.removeEventListener('deviceorientation', this.onOrient);
    this.on = false;
    this.target = { x: 0, y: 0 };
  }

  motion(e) {
    const a = e.accelerationIncludingGravity;
    const sample = a ? { x: a.x, y: a.y, z: a.z } : null;
    const r = shakeStep(this.shake, sample, performance.now());
    this.shake = r.state;
    if (r.shook) this.onShake();
  }

  orient(e) {
    const angle = screen.orientation?.angle ?? window.orientation ?? 0;
    this.target = screenGravity(e.beta, e.gamma, angle);
  }

  update(dt) {
    this.tilt = smoothTilt(this.tilt, this.on ? this.target : { x: 0, y: 0 }, dt);
    return this.tilt;
  }

  /** The pet slides and leans toward downhill. */
  applyToPose(pose) {
    const x = this.tilt.x;
    if (Math.abs(x) < 0.005) return pose;
    return { ...pose, x: pose.x + x * SLIDE, rot: pose.rot + x * LEAN };
  }
}
