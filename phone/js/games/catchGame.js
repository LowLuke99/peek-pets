// Treat Catch, the show: drag anywhere to slide the pet; it watches the lowest treat,
// opens wide as one arrives, chomps, and winces at chilies. Rules: games/catch.js.

import { newCatch, stepCatch, CATCH } from './catch.js';
import { haptic } from '../native.js';

const EMOJI = { berry: '🍓', cookie: '🍪', onigiri: '🍙', icecream: '🍦', chili: '🌶️', star: '⭐' };
const FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

export class CatchGame {
  constructor(host) {
    this.host = host;
    this.app = host.app;
    this.state = newCatch();
    this.targetX = null;
    this.lean = 0;
    this.prevX = 0;
    this.zoom = 0.62; // a smaller pet leaves room to run
  }

  /** How far the pet may slide and still be fully on screen (stage units). */
  get halfWidth() {
    const b = this.app.renderer.bounds;
    return Math.max(0.2, Math.min(b.right, -b.left) - 0.45);
  }

  pointer(kind, p) {
    this.targetX = kind === 'up' ? this.targetX : p.x;
  }

  update(dt) {
    const app = this.app;
    const r = stepCatch(this.state, dt, { targetX: this.targetX, halfWidth: this.halfWidth }, Math.random);
    this.state = r.state;
    const vx = (this.state.petX - this.prevX) / Math.max(dt, 1e-3);
    this.prevX = this.state.petX;
    this.lean += (Math.max(-1, Math.min(1, vx / CATCH.petSpeed)) - this.lean) * Math.min(1, dt * 10);
    const mouth = { x: this.state.petX, y: CATCH.catchY };
    for (const e of r.events) {
      if (e.type === 'catch') {
        app.rig.boop(0.35);
        app.particles.burst(e.kind === 'star' ? 'sparkle' : 'crumb', mouth.x, mouth.y, e.kind === 'star' ? 10 : 6, { speed: 0.9, spread: 2.6 });
        if (e.kind === 'star') { app.sfx.play('chime'); haptic('success'); } else { app.sfx.play('pop'); haptic('tap'); }
        if (e.combo > 0 && e.combo % 5 === 0) {
          app.particles.burst('heart', mouth.x, mouth.y - 0.3, 5, { speed: 0.8, spread: 2 });
          app.ui.say(`${e.combo} in a row!`, 1100);
        }
      } else if (e.type === 'ouch') {
        app.rig.perform('shake');
        app.particles.burst('steam', mouth.x, mouth.y - 0.25, 6, { speed: 0.6, spread: 2.2 });
        app.sfx.play('ouch');
        haptic('warning');
        app.ui.say('SPICY!!', 900);
      } else if (e.type === 'over') {
        this.host.finish(this.state.score, { unit: 'points', reward: Math.min(6, Math.floor(this.state.score / 5)) });
        return;
      }
    }
    // Open wide when a good treat is about to land.
    const soon = this.state.items.find((i) => i.kind !== 'chili' && Math.abs(i.x - this.state.petX) < CATCH.catchR && i.y > CATCH.catchY - 0.35 && i.y < CATCH.catchY);
    if (soon && !app.rig.isActing('aah')) app.rig.perform('aah', 0.3);
  }

  /** The lowest treat still above the pet: the eyes follow it. */
  lookPoint() {
    let best = null;
    for (const i of this.state.items) if (i.y < CATCH.catchY + 0.05 && (!best || i.y > best.y)) best = i;
    return best ? { x: best.x, y: best.y } : null;
  }

  applyToPose(pose) {
    return { ...pose, x: pose.x + this.state.petX, rot: pose.rot + this.lean * 0.14 };
  }

  hud() {
    const left = Math.max(0, Math.ceil(CATCH.seconds - this.state.time));
    return { score: String(this.state.score), info: `${'♥'.repeat(Math.max(0, this.state.lives))}${'♡'.repeat(Math.max(0, CATCH.lives - this.state.lives))}  ·  ${left}s` };
  }

  draw(ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `0.17px ${FONT}`;
    for (const i of this.state.items) {
      ctx.save();
      ctx.translate(i.x, i.y);
      ctx.rotate(Math.sin(i.y * 6 + i.id) * 0.3);
      if (i.kind === 'star') {
        ctx.shadowColor = 'rgba(255,210,80,0.9)';
        ctx.shadowBlur = 12;
      }
      ctx.fillText(EMOJI[i.kind], 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }
}
