// Cap — a mushroom frog (from the ChatGPT forest sheet). A chubby speckled green frog
// with a cream belly, peachy toes and a wide froggy grin, wearing a big red toadstool
// cap with white spots (and a baby mushroom sprouting by its shoulder). The cap wobbles
// on a spring with every hop and tips forward when it's sleepy.
//   gl(): clay frog + vinyl toadstool (also painted in 2D by Painter2D)

import { drawEyes, drawMouth, drawBlush } from '../face.js';
import { trackMotion, stepAppendage, appendage } from '../physics.js';
import { Painter2D } from '../paint2d.js';

const SKIN = '#C8DE9A';
const BODY = { x: 0, y: 0.06, w: 0.84, h: 0.68, nTop: 2.3, nBottom: 3.2, flare: 0.1 };
const FROG = { base: 'clay', color: '#B5D684', color2: '#7FA852', sssColor: '#D6F29A', spec: 0.3, shine: 34, depth: 0.42 };
const BELLY = { base: 'plate', color: '#F6EBCB', color2: '#E5D3A6', sssColor: '#FFF4D2', depth: 0.05, bevel: 0.035 };
const TOES = { base: 'clay', color: '#FFC2B0', color2: '#E89A86', sssColor: '#FFD0C0', depth: 0.06 };
const CAP = { base: 'vinyl', color: '#F37C62', color2: '#D9503D', sssColor: '#FFA080', spec: 0.45, depth: 0.42, grad: 0.5 };
const GILLS = { base: 'clay', color: '#FBE7D2', color2: '#E8C8AA', sssColor: '#FFF0DC', depth: 0.08 };
const SPOT = { base: 'clay', color: '#FFFBF4', color2: '#EFE2D2', sssColor: '#FFFFFF', depth: 0.03, spec: 0.2 };
const CAP_Y = -0.27; // the cap's rim, where it sits on the head
// Cap spots (x, y, r) in cap space (origin at the rim's centre).
const SPOTS = [[-0.3, -0.12, 0.045], [-0.14, -0.25, 0.055], [0.07, -0.28, 0.042], [0.26, -0.2, 0.05], [0.03, -0.13, 0.035], [-0.22, -0.03, 0.028], [0.37, -0.06, 0.028], [0.16, -0.08, 0.025]];
// Darker freckles on the frog's skin (drawn in 2D on top).
const FRECKLES = [[-0.32, 0.0, 0.022], [-0.27, 0.1, 0.016], [0.3, 0.02, 0.02], [0.35, 0.12, 0.014], [-0.06, -0.24, 0.013], [0.08, -0.22, 0.016], [0.36, 0.26, 0.018], [-0.36, 0.25, 0.016]];

function toes(b, x, y, spread) {
  b.balls([{ x: x - spread, y, r: 0.03 }, { x, y: y + 0.006, r: 0.032 }, { x: x + spread, y, r: 0.03 }], 0.02, TOES);
}

function babyMushroom(b) {
  b.save();
  b.translate(-0.4, -0.04);
  b.rotate(-0.25);
  b.capsule({ ax: 0, ay: 0.02, bx: 0, by: -0.07, r: 0.022 }, GILLS);
  b.blob({ x: 0, y: -0.085, w: 0.13, h: 0.08, nTop: 2.2, nBottom: 5 }, { ...CAP, depth: 0.12 });
  b.ellipse({ x: -0.022, y: -0.1, rx: 0.012, ry: 0.009 }, SPOT);
  b.ellipse({ x: 0.025, y: -0.095, rx: 0.01, ry: 0.007 }, SPOT);
  b.restore();
}

export const cap = {
  id: 'cap',
  name: 'Cap',
  blurb: 'A cheerful frog wearing a toadstool hat.',
  isNew: true,
  palette: { bgA: '#F6F8EE', bgB: '#E2EBCE', accent: '#DE5E48', pedestal: '#E9EFDC' },
  grounded: true,
  groundY: 0.44,
  hit: { cx: 0, cy: -0.06, rx: 0.48, ry: 0.5 },
  face: { lx: -0.17, rx: 0.17, y: -0.07, r: 0.1 },
  propFit: { hat: { y: -0.55, s: 0.95 }, side: 0.44, top: -0.6 },
  lines: { hello: ['Ribbit! Hi hi!', '*cap wobble* Hello!'], snackFav: ['Watermelon!! So juicy! Ribbit!'] },
  init: () => ({ cap: appendage(), throat: appendage(), motion: null }),

  step(s, pose, dt) {
    const [m, motion] = trackMotion(s.motion, pose, dt);
    const slump = (1 - pose.energy) * 0.14; // slides askew when sleepy
    return {
      motion,
      cap: stepAppendage(s.cap, Math.sin(pose.t * 0.8) * 0.04 - pose.lean.x * 0.12 + slump, (-m.dRot * 0.9 - m.vx * 5) * dt * 5, dt, 7, 0.2),
      throat: stepAppendage(s.throat, pose.happy * 0.5 + Math.max(0, Math.sin(pose.t * 2.6)) * 0.25 * pose.energy, 0, dt, 12, 0.5),
    };
  },

  gl(b, pose, s) {
    // back legs (haunches) behind the body
    for (const side of [-1, 1]) b.ellipse({ x: side * 0.33, y: 0.27, rx: 0.15, ry: 0.13 }, { ...FROG, depth: 0.12 });
    babyMushroom(b);
    b.blob(BODY, FROG);
    b.ellipse({ x: 0, y: 0.2, rx: 0.24 + s.throat.a * 0.015, ry: 0.17 + s.throat.a * 0.02 }, BELLY);
    // eye bumps on top of the head
    for (const side of [-1, 1]) b.ellipse({ x: side * 0.17, y: -0.11, rx: 0.135, ry: 0.13 }, { ...FROG, depth: 0.14 });
    // front legs and peachy toes
    for (const side of [-1, 1]) {
      b.capsule({ ax: side * 0.25, ay: 0.24, bx: side * 0.22, by: 0.38, r: 0.05 }, { ...FROG, depth: 0.1 });
      toes(b, side * 0.21, 0.42, 0.036);
      toes(b, side * 0.39, 0.42, 0.034);
    }
    // the toadstool
    b.save();
    b.translate(0, CAP_Y);
    b.rotate(s.cap.a);
    b.ellipse({ x: 0, y: 0.03, rx: 0.38, ry: 0.055 }, GILLS);
    b.blob({ x: 0, y: -0.16, w: 0.9, h: 0.4, nTop: 1.9, nBottom: 9, flare: 0.1 }, CAP);
    for (const [x, y, r] of SPOTS) b.ellipse({ x, y, rx: r, ry: r * 0.78 }, SPOT);
    b.restore();
  },

  draw(ctx, pose, s) {
    this.gl(new Painter2D(ctx), pose, s);
    this.drawFace(ctx, pose, s);
  },

  drawFace(ctx, pose, s) {
    // gills under the cap
    ctx.save();
    ctx.translate(0, CAP_Y);
    ctx.rotate(s?.cap?.a ?? 0);
    ctx.strokeStyle = 'rgba(190,130,100,0.4)';
    ctx.lineWidth = 0.006;
    for (let x = -0.3; x <= 0.31; x += 0.05) {
      ctx.beginPath(); ctx.moveTo(x * 0.55, 0.02); ctx.lineTo(x, 0.045 - Math.abs(x) * 0.08); ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(96,130,58,0.38)';
    for (const [x, y, r] of FRECKLES) { ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.save();
    ctx.translate(pose.lean.x * 0.045, pose.lean.y * 0.03);
    drawBlush(ctx, pose, { dx: 0.27, y: 0.07, rx: 0.07, ry: 0.04, color: '#FF8F96' });
    drawEyes(ctx, pose, {
      ...this.face, iris: 0.84, reach: 0.3, skin: SKIN, ink: '#24301A', sclera: '#FFFFFF',
      irisIn: '#C78A3A', irisOut: '#2E1A06', rim: 'rgba(90,110,50,0.4)', irisFiber: 'rgba(255,225,160,0.28)',
    });
    drawMouth(ctx, pose, { x: 0, y: 0.06, w: 0.17, ink: '#3A4A26', inside: '#A8434A', tongue: '#FF8C9A', line: 0.012 });
    ctx.restore();
  },
};
