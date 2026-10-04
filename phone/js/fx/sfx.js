// Tiny synthesized sound effects (no audio files). Web Audio must be unlocked by a
// user gesture on iOS, so `unlock()` is called from the first tap.

const MASTER = 0.16;

export class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      // iOS needs a sound started inside the gesture to fully unlock.
      this.tone(0, 1, 0.001, 0.0001);
    } catch {
      this.ctx = null;
    }
  }

  tone(start, freq, dur, vol = 1, type = 'sine', toFreq = null) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + start;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (toFreq) osc.frequency.exponentialRampToValueAtTime(toFreq, t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(MASTER * vol, t + Math.min(0.015, dur / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  play(name) {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    switch (name) {
      case 'boop': this.tone(0, 520, 0.11, 0.9, 'sine', 820); break;
      case 'giggle': [740, 880, 800, 960].forEach((f, i) => this.tone(i * 0.065, f, 0.06, 0.55, 'triangle')); break;
      case 'pop': this.tone(0, 880, 0.06, 0.6, 'triangle', 1320); break;
      case 'surprise': this.tone(0, 380, 0.16, 0.8, 'sine', 980); break;
      case 'ouch': this.tone(0, 700, 0.12, 0.7, 'triangle', 420); break;
      case 'yawn': this.tone(0, 340, 0.6, 0.35, 'sine', 190); break;
      case 'dizzy': [0, 1, 2, 3].forEach((i) => this.tone(i * 0.09, i % 2 ? 520 : 600, 0.09, 0.4, 'sine')); break;
      case 'hello': this.tone(0, 660, 0.12, 0.6, 'sine'); this.tone(0.11, 990, 0.18, 0.6, 'sine'); break;
      case 'bye': this.tone(0, 700, 0.12, 0.5, 'sine'); this.tone(0.12, 470, 0.22, 0.5, 'sine'); break;
      case 'kick': this.tone(0, 220, 0.08, 0.7, 'sine', 120); break;
      case 'bounce': this.tone(0, 300, 0.05, 0.25, 'sine', 200); break;
      case 'level': [523, 659, 784, 1046].forEach((f, i) => this.tone(i * 0.09, f, 0.16, 0.6, 'triangle')); break;
      case 'dance': this.melody(); break;
      case 'chime': [784, 1046, 1318].forEach((f, i) => this.tone(i * 0.12, f, 0.32, 0.45, 'sine')); break;
      case 'tada': [523, 659, 784].forEach((f, i) => this.tone(i * 0.08, f, 0.12, 0.5, 'triangle')); this.tone(0.26, 1046, 0.45, 0.6, 'triangle'); break;
      case 'alarm': for (let i = 0; i < 6; i++) this.tone(i * 0.16, i % 2 ? 1175 : 1397, 0.12, 0.5, 'square'); break;
      case 'swoosh': this.tone(0, 300, 0.25, 0.35, 'sine', 1400); break;
      case 'nudge': this.tone(0, 880, 0.09, 0.4, 'sine'); this.tone(0.1, 660, 0.14, 0.4, 'sine'); break;
      default: break;
    }
  }

  melody() {
    const notes = [523, 587, 659, 784, 659, 587, 523, 659, 784, 880, 784, 659, 587, 659, 523, 523];
    const beat = 60 / 112 / 2;
    notes.forEach((f, i) => this.tone(i * beat, f, beat * 0.9, 0.35, 'triangle'));
    [131, 165, 196, 165].forEach((f, i) => this.tone(i * beat * 4, f, beat * 3.5, 0.3, 'sine'));
  }
}
