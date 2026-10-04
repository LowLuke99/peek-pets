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
    const t = this.state.time;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const b of this.state.bubbles) {
      const x = bubbleX(b, t), y = b.y, r = POP.r;
      const tint = b.kind === 'gold' ? '255,214,90' : b.kind === 'rain' ? '150,160,185' : '190,230,255';
      const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(0.7, `rgba(${tint},0.22)`);
      g.addColorStop(1, `rgba(${tint},0.6)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(${tint},0.85)`;
      ctx.lineWidth = 0.008;
      ctx.stroke();
      ctx.font = `${r * 1.05}px ${FONT}`;
      ctx.fillText(b.kind === 'gold' ? '⭐' : b.kind === 'rain' ? '🌧️' : EMOJI[b.treat], x, y + r * 0.05);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath(); ctx.ellipse(x - r * 0.42, y - r * 0.45, r * 0.16, r * 0.08, -0.7, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}
