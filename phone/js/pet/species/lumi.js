// Lumi — a fluffy lilac moth (from the Kling concept sheet). Floats on softly flapping
// glassy wings, with feathery curled antennae on springs and a trail of sparkle dust.
// Flaps faster when happy, slower when sleepy.
//   gl(): fluff body + glass wings (also painted in 2D by Painter2D)

import { drawEyes, drawMouth, drawBlush } from '../face.js';
import { trackMotion, stepAppendage, appendage } from '../physics.js';
import { Painter2D } from '../paint2d.js';

const SKIN = '#E6D8FF';
const BODY = { x: 0, y: 0, w: 0.72, h: 0.7, nTop: 2.0, nBottom: 2.3 };
const FUZZ = { base: 'fluff', color: '#CDB6FF', color2: '#8E6FD8', sssColor: '#E7C8FF', grain: 0.14, depth: 0.42 };
const WING = { base: 'glass', color: '#D6F2EE', color2: '#B9C6F5', sssColor: '#FFFFFF', alpha: 0.72, depth: 0.05, spec: 0.6 };
// The fuzzy tuft along the body outline (smooth union of balls).
const TUFT = [{ x: -0.3, y: 0.16, r: 0.09 }, { x: -0.16, y: 0.28, r: 0.1 }, { x: 0.0, y: 0.31, r: 0.1 }, { x: 0.16, y: 0.28, r: 0.1 }, { x: 0.3, y: 0.16, r: 0.09 }];

/** A feathery antenna: a stalk that rises from the crown and curls outward at the top. */
function antenna(side, a) {
  const pts = [];
  let x = side * 0.11, y = -0.3, ang = -Math.PI / 2 + side * (0.25 + a);
  for (let k = 0; k < 8; k++) {
    pts.push({ x, y, r: 0.026 + (k >= 5 ? (k - 4) * 0.008 : 0) }); // fluffier toward the tip
    x += Math.cos(ang) * 0.05;
    y += Math.sin(ang) * 0.05;
    ang += side * (0.12 + k * 0.05);
  }
  return pts;
}

let nightCache = { at: -Infinity, night: false };
/** Lumi glows brighter at night (checked once a minute, not every frame). */
function isNight() {
  const now = Date.now();
  if (now - nightCache.at > 60_000) {
    const h = new Date(now).getHours();
    nightCache = { at: now, night: h >= 20 || h < 6 };
  }
  return nightCache.night;
}

export const lumi = {
  id: 'lumi',
  name: 'Lumi',
  blurb: 'A fuzzy moth that glows a little at night.',
  isNew: true,
  palette: { bgA: '#F6F1FF', bgB: '#DFD3FA', accent: '#9A6FE8', pedestal: '#E9E0FF' },
  grounded: false,
  floatY: 0.5,
  bob: 0.05,
  shadowW: 0.34,
  hit: { cx: 0, cy: 0, rx: 0.4, ry: 0.38 },
  face: { lx: -0.13, rx: 0.13, y: -0.02, r: 0.095 },
  propFit: { hat: { y: -0.34 }, side: 0.37 },
  lines: { hello: ['*flutter* Hi!', 'Ooh, a light! …oh, it\'s you. Hi!'], snackFav: ['Berries! *flutter flutter*'] },
  init: () => ({ antL: appendage(0), antR: appendage(0), motion: null, flap: 0 }),

  step(s, pose, dt) {
    const [m, motion] = trackMotion(s.motion, pose, dt);
    const kick = (-m.dRot * 0.6 + m.ay * 0.003) * dt * 4;
    const droop = (1 - pose.energy) * 0.4;
    return {
      motion,
      flap: s.flap + dt * (3 + pose.energy * 7 + (pose.dancing ? 6 : 0)),
      antL: stepAppendage(s.antL, droop - pose.lean.x * 0.15, -kick, dt, 9, 0.22),
      antR: stepAppendage(s.antR, droop + pose.lean.x * 0.15, kick, dt, 9, 0.22),
    };
  },

  ambient(particles, pose, dt, center) {
    if (Math.random() < dt * (0.6 + pose.energy)) particles.emit('sparkle', center.x + (Math.random() - 0.5) * 0.9, center.y + 0.1, { speed: 0.12, scale: 0.5 });
  },

  gl(b, pose, s) {
    const beat = Math.sin(s.flap);
    for (const side of [-1, 1]) {
      for (const [y, rx, ry, rot] of [[-0.12, 0.3, 0.2, -0.45], [0.14, 0.2, 0.14, 0.35]]) {
        b.save();
        b.translate(side * 0.22, y);
        b.scale(side * (0.75 + beat * 0.25), 1);
        b.rotate(rot);
        b.ellipse({ x: 0.2, y: 0, rx, ry }, WING);
        b.restore();
      }
    }
    for (const side of [-1, 1]) {
      const pts = antenna(side, side < 0 ? s.antL.a : s.antR.a);
      const mat = { ...FUZZ, color: '#B49CF0', color2: '#7E5FC8', depth: 0.06 };
      for (let k = 0; k < pts.length - 1; k++) b.capsule({ ax: pts[k].x, ay: pts[k].y, bx: pts[k + 1].x, by: pts[k + 1].y, r: pts[k].r }, mat);
      b.balls(pts.slice(5), 0.04, { ...mat, color: '#CDB6FF' });
    }
    b.blob(BODY, FUZZ);
    b.balls(TUFT, 0.06, { ...FUZZ, color: '#E2D4FF', color2: '#A88AE8', depth: 0.12 });
  },

  glow(pose) {
    const k = isNight() ? 1 : 0.4;
    return { x: 0, y: 0, r: 0.6, color: '#D9C2FF', strength: (0.08 + pose.energy * 0.1) * k };
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
    drawBlush(ctx, pose, { dx: 0.22, y: 0.06, rx: 0.06, ry: 0.035, color: '#FF9ACB' });
    drawEyes(ctx, pose, {
      ...this.face, iris: 0.82, reach: 0.34, skin: SKIN, ink: '#2C1A4A', sclera: '#FFFFFF',
      irisIn: '#8B5BD6', irisOut: '#22103F', rim: 'rgba(120,80,190,0.35)', irisFiber: 'rgba(230,210,255,0.25)',
    });
    drawMouth(ctx, pose, { x: 0, y: 0.08, w: 0.05, ink: '#2C1A4A', inside: '#7A3F8F', line: 0.01 });
    ctx.restore();
  },
};
