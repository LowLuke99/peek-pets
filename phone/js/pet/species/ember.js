// Ember — a little flame sprite. Its fire is its mood: tall and bright when happy, a
// low cozy glow when sleepy. Sheds embers as it flickers.
//   draw(): classic 2D look · gl(): glowing metaball flame · drawFace(): face on top

import { radial, wave } from '../shapes.js';
import { drawEyes, drawMouth, drawBlush } from '../face.js';

const SKIN = '#FFC86A';

function flamePath(ctx, t, energy, scale = 1) {
  const base = 0.34 * scale;
  const height = (0.22 + energy * 0.3) * scale;
  ctx.beginPath();
  const N = 90;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const up = Math.max(0, -Math.sin(a));
    const tongue = up ** 2.6 * height * (1 + 0.28 * wave(t * 3.1 + a * 3, 1));
    const side = up ** 1.2 * 0.04 * scale * wave(t * 4.3 + a * 6, 4);
    const r = base + tongue + side;
    const x = Math.cos(a) * r * (1 - up * 0.35);
    const y = Math.sin(a) * r * (a > Math.PI ? 1 : 0.92);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** The flame as blended balls that rise, sway and flicker (taller with more energy). */
function flameBalls(t, e, k = 1, lift = 0) {
  const w = (seed, amt) => wave(t * 3.1 + seed, seed) * amt;
  return [
    { x: 0, y: 0.06 + lift, r: 0.33 * k },
    { x: (-0.1 + w(1, 0.03)) * k, y: (-0.12 + lift) * k, r: 0.22 * k },
    { x: (0.09 + w(2, 0.03)) * k, y: (-0.15 + lift) * k, r: 0.2 * k },
    { x: w(3, 0.04) * k, y: (-0.3 - e * 0.1 + lift) * k, r: (0.15 + e * 0.02) * k },
    { x: (-0.03 + w(4, 0.05)) * k, y: (-0.44 - e * 0.17 + lift) * k, r: (0.085 + e * 0.025) * k },
    { x: (0.05 + w(5, 0.06)) * k, y: (-0.55 - e * 0.22 + lift) * k, r: (0.045 + e * 0.02) * k },
  ];
}

export const ember = {
  id: 'ember',
  name: 'Ember',
  blurb: 'A cozy flame sprite. Brighter when happy.',
  palette: { bgA: '#FFF5E8', bgB: '#FFD9B0', accent: '#F28C28', pedestal: '#FFE4C4' },
  grounded: false,
  floatY: 0.4,
  bob: 0.025,
  shadowW: 0.32,
  hit: { cx: 0, cy: -0.05, rx: 0.4, ry: 0.45 },
  face: { lx: -0.12, rx: 0.12, y: 0.04, r: 0.085 },
  lines: { hello: ['*crackle* Hi!', 'Warm hello!'], nap: ['Banking the coals…'], disconnect: ['Flicker… where did it go?'], snackFav: ['CHILI! *roars happily*', 'Spicy is my favourite!'] },
  init: () => ({ flick: 0 }),
  step: (s, pose, dt) => ({ flick: s.flick + dt * (1 + pose.energy * 1.5) }),

  ambient(particles, pose, dt, center) {
    if (Math.random() < dt * (1 + pose.energy * 3)) {
      particles.emit('ember', center.x + (Math.random() - 0.5) * 0.3, center.y - 0.3, { speed: 0.35, spread: 1.2 });
    }
  },

  draw(ctx, pose, s) {
    const t = s.flick;
    const e = pose.energy;
    ctx.fillStyle = radial(ctx, 0, 0, 0.05, 0.75, [[0, `rgba(255,170,70,${0.25 + e * 0.35})`], [1, 'rgba(255,170,70,0)']]);
    ctx.beginPath(); ctx.arc(0, 0, 0.75, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    ctx.rotate(-pose.lean.x * 0.05);
    flamePath(ctx, t, e, 1);
    ctx.fillStyle = radial(ctx, 0, 0.08, 0.02, 0.62, [[0, '#FFF1B8'], [0.35, '#FFC24A'], [0.75, '#FF8A2E'], [1, '#F0532A']]);
    ctx.fill();
    flamePath(ctx, t * 1.3 + 2, e * 0.8, 0.7);
    ctx.fillStyle = radial(ctx, 0, 0.1, 0, 0.4, [[0, 'rgba(255,252,220,0.95)'], [1, 'rgba(255,220,120,0)']]);
    ctx.fill();
    ctx.restore();
    this.drawFace(ctx, pose, s);
  },

  gl(b, pose, s) {
    const t = s.flick, e = pose.energy;
    b.save();
    b.rotate(-pose.lean.x * 0.05);
    b.balls(flameBalls(t, e), 0.13, { base: 'flame', color: '#FFA43A', color2: '#EE4E26', sssColor: '#FF7A30', emissive: 0.6 + e * 0.25 });
    b.balls(flameBalls(t * 1.3 + 2, e * 0.8, 0.66, 0.06), 0.1, { base: 'flame', color: '#FFF4C4', color2: '#FFC24A', sssColor: '#FFE08A', emissive: 0.85, alpha: 0.85, depth: 0.2 });
    b.restore();
  },

  glow(pose) {
    return { x: 0, y: -0.05, r: 0.85, color: '#FFA040', strength: 0.22 + pose.energy * 0.35 };
  },

  drawFace(ctx, pose) {
    ctx.save();
    ctx.translate(pose.lean.x * 0.05, pose.lean.y * 0.03);
    drawBlush(ctx, pose, { dx: 0.2, y: 0.12, rx: 0.06, ry: 0.035, color: '#FF5A3C' });
    drawEyes(ctx, pose, {
      ...this.face, style: 'bead', reach: 0.4, skin: SKIN, ink: '#5A1E0A',
      irisIn: '#6B2A10', irisOut: '#2A0A02',
    });
    drawMouth(ctx, pose, { x: 0, y: 0.15, w: 0.055, ink: '#5A1E0A', inside: '#8A2A10', tongue: '#FF6B4A', line: 0.011 });
    ctx.restore();
  },
};
