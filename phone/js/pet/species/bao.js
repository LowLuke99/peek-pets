// Bao — a living steamed bun (from the ChatGPT sweets sheet). Soft cream dough with a
// pleated swirl gathered into a little twist on top, tiny feet, and steam curling up
// whenever it's feeling warm and happy. The twist wobbles on a spring and the whole bun
// jiggles after a hop.
//   gl(): soft clay dough (also painted in 2D by Painter2D)

import { drawEyes, drawMouth, drawBlush } from '../face.js';
import { trackMotion, stepAppendage, appendage } from '../physics.js';
import { Painter2D } from '../paint2d.js';

const SKIN = '#FBEEDB';
const BODY = { x: 0, y: 0.0, w: 0.9, h: 0.78, nTop: 1.75, nBottom: 3.4, flare: 0.08 };
const DOUGH = { base: 'clay', color: '#FCF1DE', color2: '#EBD2A8', sssColor: '#FFE6B8', spec: 0.32, shine: 34, grain: 0.02, depth: 0.44 };
const TOP = -0.35; // where the pleats gather
// Pleat end points around the dome (they swirl a little clockwise on the way down).
const PLEATS = [[-0.36, -0.06], [-0.22, -0.13], [-0.07, -0.17], [0.09, -0.17], [0.24, -0.12], [0.37, -0.05]];

/** Squishy wobble about the base after a hop (same for the GL body and the painted folds). */
function jiggle(t, s) {
  const j = Math.max(-0.5, Math.min(0.5, s.jiggle.a));
  t.translate(0, 0.4);
  t.scale(1 + j * 0.08, 1 - j * 0.1);
  t.translate(0, -0.4);
}

/** Points along one pleat, from the twist down onto the dome (a swirling quadratic). */
function pleat(xe, ye, swirl, n = 12) {
  const cx = xe * 0.55 + swirl, cy = TOP + 0.03;
  return Array.from({ length: n + 1 }, (_, k) => {
    const u = k / n;
    return { x: 2 * (1 - u) * u * cx + u * u * xe, y: (1 - u) ** 2 * TOP + 2 * (1 - u) * u * cy + u * u * ye, u };
  });
}

/** A tapered sliver along a pleat (offset sideways by `dx`, widest in the middle). */
function sliver(ctx, pts, width, dx) {
  ctx.beginPath();
  pts.forEach((p, i) => { const w = Math.sin(p.u * Math.PI) * width; if (i === 0) ctx.moveTo(p.x + dx, p.y); else ctx.lineTo(p.x + dx + w, p.y - w * 0.3); });
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i], w = Math.sin(p.u * Math.PI) * width; ctx.lineTo(p.x + dx - w, p.y + w * 0.3); }
  ctx.closePath();
  ctx.fill();
}

/** The folds of the dough: a lit ridge with a soft crease shadow beside it (top-left light). */
function drawPleats(ctx, swirl) {
  ctx.save();
  for (const [xe, ye] of PLEATS) {
    const pts = pleat(xe, ye, swirl);
    ctx.fillStyle = 'rgba(176,124,62,0.2)';
    sliver(ctx, pts, 0.014, 0.016);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    sliver(ctx, pts, 0.011, -0.006);
  }
  ctx.restore();
}

export const bao = {
  id: 'bao',
  name: 'Bao',
  blurb: 'A squishy steamed bun, always a little warm.',
  isNew: true,
  palette: { bgA: '#FFF8EE', bgB: '#F5E2C6', accent: '#D4924A', pedestal: '#F8ECDA' },
  grounded: true,
  groundY: 0.42,
  hit: { cx: 0, cy: 0.02, rx: 0.46, ry: 0.42 },
  face: { lx: -0.17, rx: 0.17, y: 0.03, r: 0.105 },
  propFit: { hat: { y: -0.38 }, side: 0.45, top: -0.4 },
  lines: { hello: ['*steamy wiggle* Hiii!', 'Fresh from the steamer! Hi!'], snackFav: ['Pancakes!! Fluffy like me!'] },
  init: () => ({ twist: appendage(), jiggle: appendage(), motion: null }),

  step(s, pose, dt) {
    const [m, motion] = trackMotion(s.motion, pose, dt);
    return {
      motion,
      twist: stepAppendage(s.twist, Math.sin(pose.t * 1.1) * 0.06 - pose.lean.x * 0.15, (-m.dRot * 0.8 - m.vx * 4) * dt * 5, dt, 8, 0.2),
      jiggle: stepAppendage(s.jiggle, 0, m.ay * dt * 0.004, dt, 14, 0.18),
    };
  },

  ambient(particles, pose, dt, center) {
    const warm = pose.energy < 0.3 ? 0.1 : 0.5 + pose.happy * 1.2;
    if (Math.random() < dt * warm) {
      particles.emit('steam', center.x + (Math.random() - 0.5) * 0.18, center.y + TOP - 0.06, { speed: 0.12, spread: 0.5, scale: 0.7 + Math.random() * 0.5 });
    }
  },

  gl(b, pose, s) {
    b.save();
    jiggle(b, s);
    b.blob(BODY, DOUGH);
    // the gathered twist on top
    b.save();
    b.translate(0, TOP + 0.01);
    b.rotate(s.twist.a);
    b.balls([{ x: -0.035, y: -0.01, r: 0.04 }, { x: 0.03, y: -0.02, r: 0.042 }, { x: 0.0, y: -0.055, r: 0.034 }, { x: 0.012, y: -0.085, r: 0.022 }], 0.03, { ...DOUGH, color: '#FFF6E6', depth: 0.1 });
    b.restore();
    b.restore();
    for (const side of [-1, 1]) b.ellipse({ x: side * 0.17, y: 0.38, rx: 0.075, ry: 0.048 }, { ...DOUGH, depth: 0.08 });
  },

  draw(ctx, pose, s) {
    this.gl(new Painter2D(ctx), pose, s);
    this.drawFace(ctx, pose, s);
  },

  drawFace(ctx, pose, s) {
    ctx.save();
    if (s) jiggle(ctx, s);
    drawPleats(ctx, 0.05 + (s?.twist?.a ?? 0) * 0.1);
    ctx.restore();
    drawSteam(ctx, pose);
    ctx.save();
    ctx.translate(pose.lean.x * 0.05, pose.lean.y * 0.03);
    drawBlush(ctx, pose, { dx: 0.27, y: 0.13, rx: 0.075, ry: 0.042, color: '#FF9C8E' });
    drawEyes(ctx, pose, {
      ...this.face, iris: 0.84, reach: 0.32, skin: SKIN, ink: '#3B2412', sclera: '#FFFFFF',
      irisIn: '#C98236', irisOut: '#331606', rim: 'rgba(150,100,50,0.35)', irisFiber: 'rgba(255,225,170,0.28)',
    });
    drawMouth(ctx, pose, { x: 0, y: 0.15, w: 0.07, ink: '#4A2A14', inside: '#A9443C', tongue: '#FF8C8C', line: 0.011 });
    ctx.restore();
  },
};

/** Two wispy steam curls rising off the twist (fade away when Bao is sleepy). */
function drawSteam(ctx, pose) {
  const warm = Math.max(0, Math.min(1, (pose.energy - 0.25) * 2)) * (0.55 + pose.happy * 0.45);
  if (warm < 0.03) return;
  ctx.save();
  ctx.lineCap = 'round';
  for (const [x0, phase] of [[-0.07, 0], [0.08, 0.5]]) {
    const u = (pose.t * 0.35 + phase) % 1; // each curl rises, then fades out and restarts
    const y0 = TOP - 0.13 - u * 0.12;
    ctx.globalAlpha = warm * Math.sin(u * Math.PI) * 0.75;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 0.022;
    ctx.beginPath();
    for (let k = 0; k <= 16; k++) {
      const v = k / 16;
      const x = x0 + Math.sin(v * Math.PI * 2 + pose.t * 1.5 + phase * 6) * 0.03 * (0.5 + v);
      const y = y0 - v * 0.16;
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}
