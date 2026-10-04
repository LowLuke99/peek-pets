// Opal — a chubby crystal dragon hatchling (from the Kling concept sheet). Pastel vinyl
// scales, iridescent horns that shimmer through teal → lilac → pink, little wings that
// flutter when happy, a curly tail with a spade tip, and a cream belly.
//   gl(): vinyl + glass parts (also painted in 2D by Painter2D)

import { drawEyes, drawMouth, drawBlush } from '../face.js';
import { trackMotion, stepAppendage, appendage } from '../physics.js';
import { Painter2D } from '../paint2d.js';

const SKIN = '#D9ECF2';
const BODY = { x: 0, y: 0, w: 0.8, h: 0.8, nTop: 2.1, nBottom: 2.9, flare: 0.08 };
const SCALES = { base: 'vinyl', color: '#9CC9DA', color2: '#5E8FB3', sssColor: '#C6F0FF', depth: 0.42 };
const BELLY = { base: 'plate', color: '#F4ECD8', color2: '#E3D3B4', sssColor: '#FFF4D8', depth: 0.05, bevel: 0.03 };
const FRILL = { base: 'vinyl', color: '#C7A6F0', color2: '#8F6CC9', sssColor: '#E8CCFF', depth: 0.06 };

/** Iridescent colour that drifts over time (hex, so the 2D painter can shade it). */
function opalescent(t, offset = 0) {
  // drifts lilac → pink → teal like an opal turning in the light
  const h = (((285 + 75 * Math.sin(t * 0.6 + offset)) % 360) + 360) % 360 / 360;
  return hslHex(h, 0.6, 0.78);
}

function hslHex(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

const TAIL = [{ x: 0.0, y: 0.0, r: 0.08 }, { x: 0.09, y: -0.02, r: 0.068 }, { x: 0.17, y: -0.06, r: 0.056 }, { x: 0.23, y: -0.12, r: 0.045 }, { x: 0.26, y: -0.19, r: 0.036 }];

export const opal = {
  id: 'opal',
  name: 'Opal',
  blurb: 'A chubby crystal dragon with shimmering horns.',
  isNew: true,
  palette: { bgA: '#EFF7FB', bgB: '#D3E6F2', accent: '#5E8FB3', pedestal: '#DEEDF5' },
  grounded: true,
  groundY: 0.44,
  hit: { cx: 0, cy: 0, rx: 0.44, ry: 0.42 },
  face: { lx: -0.15, rx: 0.15, y: -0.1, r: 0.1 },
  propFit: { hat: { y: -0.4 }, side: 0.42 },
  lines: { hello: ['*tiny roar* Rawr! Hi!', 'Hello, hoard-keeper!'], snackSpicy: ['I breathe… sparkles?!'], snackFav: ['Cookies are my treasure!'] },
  init: () => ({ wings: appendage(), tail: appendage(), motion: null }),

  step(s, pose, dt) {
    const [m, motion] = trackMotion(s.motion, pose, dt);
    const flutter = pose.happy * 0.35 + (pose.dancing ? 0.4 : 0) + (pose.wave ?? 0) * 0.5;
    return {
      motion,
      wings: stepAppendage(s.wings, flutter * Math.sin(pose.t * 14), -m.vy * dt * 3, dt, 16, 0.3),
      tail: stepAppendage(s.tail, Math.sin(pose.t * 1.6) * 0.12 + pose.happy * 0.2, (-m.dRot - m.vx * 3) * dt * 5, dt, 8, 0.25),
    };
  },

  gl(b, pose, s) {
    const horn = { base: 'glass', color: opalescent(pose.t), color2: opalescent(pose.t, 2), sssColor: '#FFFFFF', depth: 0.1 };
    // wings behind
    for (const side of [-1, 1]) {
      b.save();
      b.translate(side * 0.3, -0.12);
      b.rotate(side * (0.5 + s.wings.a));
      b.poly([{ x: 0, y: 0.05 }, { x: side * 0.24, y: -0.12 }, { x: side * 0.2, y: 0.04 }, { x: side * 0.14, y: 0.12 }], 0.04, FRILL);
      b.restore();
    }
    // tail curling out to the right
    b.save();
    b.translate(0.3, 0.3);
    b.rotate(s.tail.a);
    b.balls(TAIL, 0.05, { ...SCALES, depth: 0.12 });
    b.poly([{ x: 0.22, y: -0.2 }, { x: 0.3, y: -0.3 }, { x: 0.34, y: -0.2 }], 0.02, FRILL);
    b.restore();
    // horns: tapered and swept back
    for (const side of [-1, 1]) {
      b.save();
      b.translate(side * 0.2, -0.3);
      b.rotate(side * 0.3);
      b.balls([0, 1, 2, 3, 4, 5, 6].map((k) => ({ x: side * (k * k) * 0.0045, y: -k * 0.03, r: 0.054 - k * 0.0065 })), 0.035, horn);
      b.restore();
    }
    for (const side of [-1, 1]) b.ellipse({ x: side * 0.17, y: 0.4, rx: 0.1, ry: 0.06 }, { ...SCALES, depth: 0.06 });
    b.blob(BODY, SCALES);
    for (const side of [-1, 1]) {
      b.save();
      b.translate(side * 0.38, -0.08);
      b.rotate(side * 0.6);
      b.ellipse({ x: 0, y: 0, rx: 0.05, ry: 0.09 }, FRILL);
      b.restore();
    }
    b.ellipse({ x: 0, y: 0.2, rx: 0.22, ry: 0.17 }, BELLY);
    for (const [x, y, r] of [[-0.07, -0.39, 0.035], [0.07, -0.39, 0.035], [0, -0.42, 0.04]]) {
      b.poly([{ x: x - r, y: y + r * 0.6 }, { x, y: y - r * 1.2 }, { x: x + r, y: y + r * 0.6 }], 0.012, { ...FRILL, color: '#B8E2EA', color2: '#79B2C6' });
    }
  },

  draw(ctx, pose, s) {
    this.gl(new Painter2D(ctx), pose, s);
    this.drawFace(ctx, pose, s);
  },

  drawFace(ctx, pose) {
    // belly stripes
    ctx.strokeStyle = 'rgba(190,160,110,0.35)';
    ctx.lineWidth = 0.008;
    for (const y of [0.13, 0.2, 0.27]) {
      ctx.beginPath(); ctx.moveTo(-0.15 + Math.abs(y - 0.2) * 0.6, y); ctx.quadraticCurveTo(0, y + 0.02, 0.15 - Math.abs(y - 0.2) * 0.6, y); ctx.stroke();
    }
    ctx.save();
    ctx.translate(pose.lean.x * 0.045, pose.lean.y * 0.03);
    drawBlush(ctx, pose, { dx: 0.25, y: -0.01, rx: 0.06, ry: 0.035, color: '#F5A3C7' });
    drawEyes(ctx, pose, {
      ...this.face, iris: 0.8, reach: 0.32, skin: SKIN, ink: '#1D3346', sclera: '#FFFFFF',
      irisIn: '#4FC7D9', irisOut: '#0B3550', rim: 'rgba(70,130,170,0.35)', irisFiber: 'rgba(200,250,255,0.25)',
    });
    // little nostrils
    ctx.fillStyle = 'rgba(40,70,90,0.45)';
    for (const x of [-0.025, 0.025]) { ctx.beginPath(); ctx.ellipse(x, 0.0, 0.008, 0.005, 0, 0, Math.PI * 2); ctx.fill(); }
    drawMouth(ctx, pose, { x: 0, y: 0.04, w: 0.07, ink: '#1D3346', inside: '#8C3F5E', line: 0.011 });
    ctx.restore();
  },
};
