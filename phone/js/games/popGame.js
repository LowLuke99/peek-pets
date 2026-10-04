// Bubble Pop, the show: bubbles drift up past the pet; tap to pop. The pet watches the
// highest bubble, cheers on golden pops and gets rained on by rain clouds.

import { newPop, stepPop, tapPop, bubbleX, POP } from './pop.js';
import { haptic } from '../native.js';

const EMOJI = { berry: '🍓', cookie: '🍪', onigiri: '🍙', icecream: '🍦' };
const FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

export class PopGame {
  constructor(host) {
    this.host = host;
    this.app = host.app;
    this.state = newPop();
    this.zoom = 0.7;
  }

  get halfWidth() {
    const b = this.app.renderer.bounds;
    return Math.max(0.3, Math.min(b.right, -b.left) - POP.r * 1.4);
  }

  quitScore() { return this.state.score; }
  finishNow(score) { this.host.finish(score, { unit: 'points' }); }

  pointer(kind, p) {
    if (kind !== 'down') return;
    const app = this.app;
    const r = tapPop(this.state, p);
    this.state = r.state;
    const e = r.event;
    if (!e) return;
    if (e.type === 'rain') {
      app.rig.perform('shake');
      const top = app.headStage();
      app.particles.burst('rain', top.x, top.y - 0.15, 14, { speed: 0.3, spread: 1.4, angle: Math.PI / 2 });
      app.sfx.play('ouch');
      haptic('warning');
      app.ui.say('Brr! Rain!', 900);
    } else {
      app.particles.burst('sparkle', e.x, e.y, e.kind === 'gold' ? 10 : 4, { speed: 0.9, spread: 3 });
      app.particles.burst('bubble', e.x, e.y, 4, { speed: 0.6, spread: 3 });
      app.sfx.play(e.kind === 'gold' ? 'chime' : 'pop');
      haptic('tap');
      if (e.kind === 'gold') { app.rig.hopUp(0.6); app.react({ type: 'double' }); }
    }
  }

  update(dt) {
    const r = stepPop(this.state, dt, Math.random, this.halfWidth);
    this.state = r.state;
    if (r.events.some((e) => e.type === 'over')) this.host.finish(this.state.score, { unit: 'points' });
  }

  lookPoint() {
    let best = null;
    for (const b of this.state.bubbles) if (b.y < 0 && (!best || b.y < best.y)) best = b;
    return best ? { x: bubbleX(best, this.state.time), y: best.y } : null;
  }

  hud() {
    return { score: String(this.state.score), info: `🫧 ${this.state.pops} popped  ·  ${Math.max(0, Math.ceil(POP.seconds - this.state.time))}s` };
  }

  draw(ctx) {
    const t = this.state.time, r = POP.r;
    for (const b of this.state.bubbles) {
      ctx.drawImage(sprite(b.kind === 'treat' ? b.treat : b.kind), bubbleX(b, t) - r, b.y - r, r * 2, r * 2);
    }
  }
}

// Each bubble look is drawn once into a small canvas and reused (no gradients per frame).
const SPRITE_PX = 128;
const sprites = new Map();

function sprite(kind) {
  let c = sprites.get(kind);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = SPRITE_PX;
  const ctx = c.getContext('2d');
  const R = SPRITE_PX / 2 - 3;
  ctx.translate(SPRITE_PX / 2, SPRITE_PX / 2);
  const tint = kind === 'gold' ? '255,214,90' : kind === 'rain' ? '150,160,185' : '190,230,255';
  const g = ctx.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R);
  g.addColorStop(0, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.7, `rgba(${tint},0.22)`);
  g.addColorStop(1, `rgba(${tint},0.6)`);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = `rgba(${tint},0.85)`;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(R * 1.05)}px ${FONT}`;
  ctx.fillText(kind === 'gold' ? '⭐' : kind === 'rain' ? '🌧️' : EMOJI[kind], 0, R * 0.05);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath(); ctx.ellipse(-R * 0.42, -R * 0.45, R * 0.16, R * 0.08, -0.7, 0, Math.PI * 2); ctx.fill();
  sprites.set(kind, c);
  return c;
}
