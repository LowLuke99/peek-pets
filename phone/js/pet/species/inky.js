// Inky — a little glowing jelly octopus (from the Kling concept sheet). A translucent
// teal dome with glowing spots, six curly tentacles that ripple and curl up at the tips,
// and big sparkly eyes. Blushes deep when happy; tentacles wave hello.
//   gl(): jelly parts (also painted in 2D by Painter2D for the Classic look)

import { drawEyes, drawMouth, drawBlush } from '../face.js';
import { trackMotion, stepAppendage, appendage } from '../physics.js';
import { Painter2D } from '../paint2d.js';

const SKIN = '#BDF5EA';
const HEAD = { x: 0, y: -0.1, w: 0.8, h: 0.7, nTop: 2.0, nBottom: 2.4, flare: 0.04 };
const SPOTS = [[-0.24, -0.3, 0.032], [0.05, -0.38, 0.026], [0.27, -0.27, 0.03], [-0.08, -0.33, 0.018], [0.18, -0.38, 0.016]];
// Tentacle bases (x) and which way they curl.
const ARMS = [[-0.3, -1], [-0.18, -1], [-0.06, -1], [0.06, 1], [0.18, 1], [0.3, 1]];
const jelly = (pose) => ({ base: 'jelly', color: '#86EAD8', color2: '#2E9E98', sssColor: '#7CFFE4', emissive: 0.1 + pose.energy * 0.12 });

/** One tentacle as a chain of shrinking balls that sweeps out and curls up at the tip. */
function arm(bx, side, t, i, wave, curl) {
  const pts = [];
  for (let k = 0; k < 6; k++) {
    const u = k / 5;
    const ripple = Math.sin(t * 2.4 - k * 0.9 + i) * 0.012 * k;
    const out = side * (0.012 + Math.abs(bx) * 0.12) * k * (1 + wave * 0.5);
    const lift = k >= 3 ? (k - 2) ** 1.5 * 0.03 * (1 + curl) : 0;
    const back = k >= 4 ? -side * (k - 3) * 0.022 : 0; // the tip curls back in
    pts.push({ x: bx + out + back + ripple, y: 0.2 + u * 0.15 - lift - wave * u * 0.14, r: 0.078 - k * 0.0095 });
  }
  return pts;
}

export const inky = {
  id: 'inky',
  name: 'Inky',
  blurb: 'A glowing jelly octopus with curly arms.',
  isNew: true,
  palette: { bgA: '#EBFBF8', bgB: '#C2EDE6', accent: '#1FA898', pedestal: '#D2F3EE' },
  grounded: true,
  groundY: 0.4,
  hit: { cx: 0, cy: -0.06, rx: 0.46, ry: 0.42 },
  face: { lx: -0.14, rx: 0.14, y: -0.07, r: 0.1 },
  propFit: { hat: { y: -0.4 }, hands: false, side: 0.4 },
  lines: { hello: ['Blub blub! Hi!', '*waves all six arms*'], snackFav: ['Ice cream!! *happy wiggle*'] },
  init: () => ({ wave: appendage(), motion: null }),

  step(s, pose, dt) {
    const [m, motion] = trackMotion(s.motion, pose, dt);
    const target = (pose.wave ?? 0) * 1.2 + pose.happy * 0.35 + (pose.dancing ? 0.5 : 0);
    return { motion, wave: stepAppendage(s.wave, target, -m.vy * dt * 4, dt, 8, 0.3) };
  },

  ambient(particles, pose, dt, center) {
    if (Math.random() < dt * 0.35) particles.emit('bubble', center.x + (Math.random() - 0.5) * 0.5, center.y - 0.2, { speed: 0.18, scale: 0.6 + Math.random() * 0.8 });
  },

  gl(b, pose, s) {
    const mat = jelly(pose);
    const curl = pose.energy < 0.3 ? -0.4 : 0;
    ARMS.forEach(([bx, side], i) => b.balls(arm(bx, side, pose.t, i, Math.max(0, s.wave.a), curl), 0.05, { ...mat, depth: 0.12, mode: 'dome' }));
    b.blob(HEAD, { ...mat, depth: 0.5 });
  },

  glow(pose) {
    return { x: 0, y: -0.1, r: 0.7, color: '#7CFFE4', strength: 0.1 + pose.energy * 0.14 };
  },

  draw(ctx, pose, s) {
    const p = new Painter2D(ctx);
    p.glow(this.glow(pose));
    this.gl(p, pose, s);
    this.drawFace(ctx, pose, s);
  },

  drawFace(ctx, pose, s) {
    for (const [x, y, r] of SPOTS) {
      ctx.fillStyle = `rgba(220,255,248,${0.45 + 0.25 * Math.sin(pose.t * 2 + x * 9)})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    // suckers on the curled tips
    ctx.fillStyle = 'rgba(255,244,214,0.85)';
    ARMS.forEach(([bx, side], i) => {
      for (const q of arm(bx, side, pose.t, i, Math.max(0, s?.wave?.a ?? 0), 0).slice(2, 5)) {
        ctx.beginPath(); ctx.arc(q.x, q.y + q.r * 0.45, q.r * 0.3, 0, Math.PI * 2); ctx.fill();
      }
    });
    ctx.save();
    ctx.translate(pose.lean.x * 0.05, pose.lean.y * 0.03);
    drawBlush(ctx, pose, { dx: 0.24, y: 0.0, rx: 0.07, ry: 0.04, color: '#FF8FB8' });
    drawEyes(ctx, pose, {
      ...this.face, iris: 0.8, reach: 0.34, skin: SKIN, ink: '#0E3B3A', sclera: '#F4FFFD',
      irisIn: '#2FC6C0', irisOut: '#063A3E', rim: 'rgba(30,140,130,0.35)', irisFiber: 'rgba(200,255,250,0.25)',
    });
    drawMouth(ctx, pose, { x: 0, y: 0.04, w: 0.055, ink: '#0E3B3A', inside: '#2B6F7A', line: 0.011 });
    ctx.restore();
  },
};
