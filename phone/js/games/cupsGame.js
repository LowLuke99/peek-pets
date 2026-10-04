// Cup Shuffle, the show: three cups on the floor in front of the pet. The treat is
// shown, the cups shuffle (faster each round), you tap one. On early rounds the pet
// "peeks": its eyes follow the right cup. Rules and timing: games/cups.js.

import { newCups, cupsAt, phaseAt, pickCup, CUPS } from './cups.js';
import { favouriteOf, snackById } from '../core/snacks.js';
import { shade } from '../pet/face.js';
import { haptic } from '../native.js';

const CUP_Y = 0.42;          // cup mouth sits this far below the pet's ground line (in front of it)
const CUP_H = 0.3, CUP_W = 0.27;
const REVEAL_S = 1.5;
const FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

export class CupsGame {
  constructor(host) {
    this.host = host;
    this.app = host.app;
    this.level = 1;
    this.treat = snackById(favouriteOf(this.app.species.id))?.emoji ?? '🍓';
    this.newRound();
  }

  newRound() {
    this.round = newCups(this.level, Math.random);
    this.t = 0;
    this.picked = null;
    this.reveal = 0;
    if (this.level === CUPS.peekUntil + 1) this.app.ui.say("I'm too dizzy to peek… you're on your own!", 2200);
    else if (this.level > 1) this.app.ui.say(`Round ${this.level}!`, 1000);
  }

  /** Lift and shrink the pet a little so the cups fit on the floor in front of it. */
  get inset() {
    return Math.round(this.app.renderer.H * 0.3);
  }

  get zoom() {
    return 0.72;
  }

  get xScale() {
    const b = this.app.renderer.bounds;
    const half = Math.min(b.right, -b.left) - CUP_W * 0.62;
    return Math.min(1, half / CUPS.slotX[2]);
  }

  pointer(kind, p) {
    if (kind !== 'down' || this.picked !== null || phaseAt(this.round, this.t) !== 'pick') return;
    const k = this.xScale;
    let best = null, dist = Infinity;
    for (let slot = 0; slot < 3; slot++) {
      const d = Math.abs(p.x - CUPS.slotX[slot] * k);
      if (d < dist) { dist = d; best = slot; }
    }
    if (dist > CUP_W || p.y < CUP_Y - CUP_H - 0.25) return;
    this.pick(best);
  }

  pick(slot) {
    const app = this.app;
    this.picked = slot;
    this.correct = pickCup(this.round, slot);
    this.reveal = 0;
    if (this.correct) {
      app.react({ type: 'double' });
      app.rig.hopUp(0.8);
      app.sfx.play('tada');
      haptic('success');
      app.ui.say(this.level >= 4 ? 'Wow, without my help!' : 'Found it!', 1300);
    } else {
      app.rig.perform('nope');
      app.sfx.play('bye');
      haptic('warning');
      app.ui.say('Oops! It was over here…', 1500);
    }
  }

  update(dt) {
    if (this.picked === null) { this.t += dt; return; }
    this.reveal += dt;
    if (this.reveal < REVEAL_S) return;
    if (this.correct) {
      this.level += 1;
      this.newRound();
    } else {
      this.host.finish(this.level - 1, { unit: this.level - 1 === 1 ? 'round' : 'rounds', reward: Math.min(6, this.level - 1) });
    }
  }

  cups() {
    const end = this.round.showFor + this.round.swaps.length * this.round.swapTime + 1;
    return cupsAt(this.round, this.picked === null ? this.t : end);
  }

  /** Early rounds: the pet's eyes follow the cup with the treat. */
  lookPoint() {
    const phase = phaseAt(this.round, this.t);
    if (this.picked === null && phase !== 'show' && !this.round.petPeeks) return null;
    const cup = this.cups()[this.round.treatCup];
    return { x: cup.x * this.xScale, y: CUP_Y - CUP_H * 0.5 };
  }

  hud() {
    return { score: `Round ${this.level}`, info: this.round.petPeeks ? '👀 your pet is peeking' : '🙈 no peeking now' };
  }

  draw(ctx) {
    const k = this.xScale;
    const accent = this.app.species.palette.accent;
    const cups = this.cups();
    const liftOf = (c) => {
      if (this.picked === null) return c.lift;
      const show = c.slot === this.picked || (!this.correct && c.id === this.round.treatCup);
      return show ? Math.min(1, this.reveal / 0.35) : 0;
    };
    // Treat first (under its cup), then cups back-to-front.
    const treatCup = cups[this.round.treatCup];
    if (liftOf(treatCup) > 0.05) {
      ctx.save();
      ctx.font = `0.16px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(this.treat, treatCup.x * k, CUP_Y - 0.01);
      ctx.restore();
    }
    for (const c of [...cups].sort((a, b) => a.y - b.y)) drawCup(ctx, c.x * k, CUP_Y + c.y * 0.4, liftOf(c), accent, c.y);
  }
}

function drawCup(ctx, x, y, lift, accent, depth) {
  const top = y - CUP_H - lift * 0.28;
  const bottom = y - lift * 0.28;
  const s = 1 + depth * 0.4; // a hair bigger when passing in front
  ctx.save();
  ctx.translate(x, bottom);
  ctx.scale(s, s);
  // floor shadow (stays on the floor while the cup lifts)
  ctx.save();
  ctx.translate(0, lift * 0.28);
  ctx.scale(1, 0.22);
  ctx.fillStyle = `rgba(110,40,32,${0.22 * (1 - lift * 0.6)})`;
  ctx.beginPath(); ctx.arc(0, 0, CUP_W * 0.62, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  const h = bottom - top, wTop = CUP_W * 0.36, wBot = CUP_W * 0.5;
  const g = ctx.createLinearGradient(-wBot, 0, wBot, 0);
  g.addColorStop(0, shade(accent, 0.35));
  g.addColorStop(0.45, accent);
  g.addColorStop(1, shade(accent, -0.25));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-wBot, 0);
  ctx.lineTo(-wTop, -h + 0.03);
  ctx.quadraticCurveTo(-wTop, -h, -wTop + 0.03, -h);
  ctx.lineTo(wTop - 0.03, -h);
  ctx.quadraticCurveTo(wTop, -h, wTop, -h + 0.03);
  ctx.lineTo(wBot, 0);
  ctx.quadraticCurveTo(0, 0.035, -wBot, 0);
  ctx.closePath();
  ctx.fill();
  // stripes + rim + gloss
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 0.022;
  for (const v of [0.35, 0.62]) {
    const w = wBot + (wTop - wBot) * v;
    ctx.beginPath(); ctx.moveTo(-w + 0.005, -h * v); ctx.quadraticCurveTo(0, -h * v + 0.02, w - 0.005, -h * v); ctx.stroke();
  }
  ctx.fillStyle = shade(accent, -0.3);
  ctx.beginPath(); ctx.ellipse(0, 0, wBot, 0.03, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath(); ctx.ellipse(-wTop * 0.45, -h * 0.55, 0.018, h * 0.3, 0.12, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
