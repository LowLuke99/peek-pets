// Mallow — a marshmallow ghost (from the ChatGPT sweets sheet). A soft, glossy white
// bell that floats, with a wavy hem that ripples as it drifts and trails behind when it
// moves, two little nub hands held up by its cheeks, and a faint lilac glow.
//   gl(): one smooth jelly-marshmallow metaball body (also painted in 2D by Painter2D)

import { drawEyes, drawMouth, drawBlush } from '../face.js';
import { trackMotion, stepAppendage, appendage } from '../physics.js';
import { Painter2D } from '../paint2d.js';

const SKIN = '#FFFFFF';
const MARSH = { base: 'jelly', color: '#FFFFFF', color2: '#E9E2F6', sssColor: '#F4ECFF', alpha: 0.95, emissive: 0.1, spec: 0.55, shine: 70, rim: 0.6, depth: 0.48, grad: 0.5 };
const HAND = { ...MARSH, color2: '#DCD0F0', grad: 0.9, depth: 0.3, alpha: 1 };
// Hem scallops (x, y) along the bottom edge.
const HEM = [[-0.33, 0.27], [-0.165, 0.315], [0.0, 0.29], [0.165, 0.315], [0.33, 0.27]];

/** Head, belly and hem circles (the hem ripples, sways with motion, and sags when sleepy). */
function body(pose, s) {
  const sway = Math.max(-0.6, Math.min(0.6, s.hem.a));
  const lift = (1 - pose.energy) * 0.02;
  const ripple = 0.012 + pose.energy * 0.008;
  const hem = HEM.map(([x, y], i) => ({
    x: x + sway * 0.07 * (0.6 + Math.abs(x)),
    y: y + lift + Math.sin(pose.t * 3.2 - i * 1.25) * ripple,
    r: 0.095,
  }));
  return [{ x: 0, y: -0.12, r: 0.32 }, { x: sway * 0.02, y: 0.07, r: 0.325 }, ...hem];
}

export const mallow = {
  id: 'mallow',
  name: 'Mallow',
  blurb: 'A marshmallow ghost with a wavy, wiggly hem.',
  isNew: true,
  palette: { bgA: '#F9F6FF', bgB: '#E5DCF6', accent: '#9A84DE', pedestal: '#EEE8FB' },
  grounded: false,
  floatY: 0.48,
  bob: 0.055,
  shadowW: 0.36,
  hit: { cx: 0, cy: 0, rx: 0.44, ry: 0.44 },
  face: { lx: -0.14, rx: 0.14, y: -0.1, r: 0.095 },
  propFit: { hat: { y: -0.41 }, side: 0.4, top: -0.44 },
  lines: { hello: ['Boo! …hehe, hi!', '*floats closer* Hello~'], snackFav: ['Cupcake!! Sweet as a dream!'] },
  init: () => ({ hem: appendage(), arms: appendage(), motion: null }),

  step(s, pose, dt) {
    const [m, motion] = trackMotion(s.motion, pose, dt);
    return {
      motion,
      hem: stepAppendage(s.hem, Math.sin(pose.t * 0.9) * 0.12, (-m.vx * 4 - m.dRot * 0.6) * dt * 5, dt, 6, 0.25),
      arms: stepAppendage(s.arms, (pose.wave ?? 0) * 1.2 + pose.happy * 0.25 - (1 - pose.energy) * 0.3, -m.vy * dt * 2, dt, 11, 0.3),
    };
  },

  ambient(particles, pose, dt, center) {
    if (Math.random() < dt * (0.15 + pose.happy * 0.5)) {
      particles.emit('sparkle', center.x + (Math.random() - 0.5) * 0.8, center.y + (Math.random() - 0.3) * 0.5, { speed: 0.08, scale: 0.5 });
    }
  },

  gl(b, pose, s) {
    const parts = body(pose, s);
    if (b instanceof Painter2D) {
      // the 2D painter has no smooth union, so trace the bell + scalloped hem by hand
      ghostPath(b.ctx, parts);
      b.fill(MARSH, 0, 0, 0.44, 0.44);
    } else {
      b.balls(parts, 0.12, MARSH);
    }
    // little nub hands held up by the cheeks
    const a = s.arms.a;
    for (const side of [-1, 1]) {
      const raise = side > 0 ? a : a * 0.35;
      b.ellipse({ x: side * (0.2 + raise * 0.03), y: 0.1 - raise * 0.08, rx: 0.07, ry: 0.08 }, HAND);
    }
  },

  glow(pose) {
    return { x: 0, y: 0, r: 0.66, color: '#E6D8FF', strength: 0.12 + pose.energy * 0.12 };
  },

  draw(ctx, pose, s) {
    const p = new Painter2D(ctx);
    p.glow(this.glow(pose));
    this.gl(p, pose, s);
    this.drawFace(ctx, pose, s);
  },

  drawFace(ctx, pose) {
    ctx.save();
    ctx.translate(pose.lean.x * 0.05, pose.lean.y * 0.03);
    drawBlush(ctx, pose, { dx: 0.22, y: -0.01, rx: 0.065, ry: 0.038, color: '#FF9FC0' });
    drawEyes(ctx, pose, {
      ...this.face, iris: 0.86, reach: 0.33, skin: SKIN, ink: '#2A2150', sclera: '#FFFFFF',
      irisIn: '#7B6BD8', irisOut: '#1A1240', rim: 'rgba(120,100,200,0.32)', irisFiber: 'rgba(220,210,255,0.28)',
    });
    drawMouth(ctx, pose, { x: 0, y: 0.0, w: 0.055, ink: '#3A2A5A', inside: '#9A3F6A', tongue: '#FF9DB8', line: 0.01 });
    ctx.restore();
  },
};

/** Classic look: the ghost outline through the same head + hem circles the GL body uses. */
function ghostPath(ctx, parts) {
  const [head, , ...hem] = parts;
  const first = hem[0], last = hem[hem.length - 1];
  ctx.beginPath();
  ctx.moveTo(last.x + last.r * 0.95, last.y + last.r * 0.2);
  ctx.quadraticCurveTo(head.x + head.r * 1.04, head.y + 0.24, head.x + head.r, head.y);
  ctx.arc(head.x, head.y, head.r, 0, Math.PI, true);
  ctx.quadraticCurveTo(head.x - head.r * 1.04, head.y + 0.24, first.x - first.r * 0.95, first.y + first.r * 0.2);
  // scallops along the bottom, left to right
  for (let i = 0; i < hem.length; i++) {
    const h = hem[i], next = hem[i + 1];
    const endX = next ? (h.x + next.x) / 2 : h.x + h.r * 0.95;
    const endY = next ? (h.y + next.y) / 2 + h.r * 0.45 : h.y + h.r * 0.2;
    ctx.quadraticCurveTo(h.x, h.y + h.r * 1.9, endX, endY);
  }
  ctx.closePath();
}
