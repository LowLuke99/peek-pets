// Zoe — a black French bulldog (from Luke's photo of the real Zoe). Glossy black coat,
// big bat ears on springs, a grizzled "sugar face" muzzle with salt-and-pepper flecks,
// puffy jowls, a broad shiny nose, a white chest blaze that sits a little off-centre and
// white tips on one front paw. Her head cocks toward your cursor, the ears perk up when
// she's surprised and splay out sideways ("airplane ears") when she's sleepy, and she
// snorts happy little puffs.
//   gl(): clay dog parts (also painted in 2D by Painter2D) · drawFace(): eyes, nose, flecks on top

import { drawEyes, drawMouth, drawBlush } from '../face.js';
import { trackMotion, stepAppendage, appendage } from '../physics.js';
import { Painter2D } from '../paint2d.js';

const FUR_SKIN = '#2B2629'; // what shows when the lids close
const INK = '#120D0F';
const COAT = { base: 'clay', color: '#2C272B', color2: '#0C090B', sssColor: '#4A3A42', spec: 0.55, shine: 52, rim: 0.6, depth: 0.42, grain: 0.025 };
const EAR_IN = { base: 'clay', color: '#7A5A60', color2: '#3A272C', sssColor: '#C07080', spec: 0.08, depth: 0.04, ao: 0.35 };
const MUZZLE = { base: 'fluff', color: '#4E484C', color2: '#1E1A1D', sssColor: '#6A5C63', depth: 0.16, grain: 0.06, spec: 0.18 };
const NOSE = { base: 'vinyl', color: '#3A3235', color2: '#0B0809', sssColor: '#3A2A30', spec: 0.75, shine: 90, depth: 0.12 };
const BLAZE = { base: 'fluff', color: '#FFFCFA', color2: '#DCD3D0', sssColor: '#FFFFFF', depth: 0.08 };
const TOE = { base: 'fluff', color: '#FFFFFF', color2: '#E2DAD7', sssColor: '#FFFFFF', depth: 0.04 };

const HEAD = { x: 0, y: -0.12, w: 0.92, h: 0.6, nTop: 2.5, nBottom: 2.5, flare: 0.04 };
const CHEST = { x: 0, y: 0.2, w: 0.66, h: 0.5, nTop: 2.2, nBottom: 3, flare: 0.06 };
const NOSE_Y = 0.03;
const EAR_BASE = { x: 0.26, y: -0.31 };
const EAR_SPLAY = 0.3; // resting outward angle
// Bat ear: broad base narrowing to a rounded tip (ear space, origin at the base, pointing up).
const EAR = { x: 0, y: -0.12, w: 0.27, h: 0.36, nTop: 2.3, nBottom: 3.4, flare: 0.26 };
const EAR_INNER = { x: 0, y: -0.135, w: 0.14, h: 0.23, nTop: 2.2, nBottom: 2.6, flare: 0.22 };
// The white blaze is lopsided on the real Zoe: bigger on her right (viewer's left).
const BLAZE_BALLS = [{ x: -0.07, y: 0.17, r: 0.1 }, { x: 0.05, y: 0.18, r: 0.085 }, { x: -0.03, y: 0.27, r: 0.075 }, { x: 0.06, y: 0.28, r: 0.045 }, { x: -0.14, y: 0.22, r: 0.05 }];

/** Salt-and-pepper flecks on the muzzle and chin, fixed so they don't shimmer. */
const FLECKS = (() => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out = [];
  while (out.length < 110) {
    const x = (rnd() - 0.5) * 0.4, y = 0.05 + rnd() * 0.16;
    if ((x / 0.2) ** 2 + ((y - 0.13) / 0.1) ** 2 > 1) continue; // stay on the muzzle
    if (Math.abs(x) < 0.08 && y < 0.09) continue;               // not on the nose
    out.push([x, y, 0.0025 + rnd() * 0.003, 0.18 + rnd() * 0.3]);
  }
  return out;
})();

/** The head cocks a little toward the cursor (shared by the body parts and the face). */
const headShift = (pose) => ({ x: pose.lean.x * 0.03, y: pose.lean.y * 0.02, rot: pose.lean.x * 0.07 });

function inHead(b, pose, draw) {
  const h = headShift(pose);
  b.save();
  b.translate(h.x, h.y - 0.12);
  b.rotate(h.rot);
  b.translate(0, 0.12);
  draw();
  b.restore();
}

export const zoe = {
  id: 'zoe',
  name: 'Zoe',
  blurb: 'A snorty little French bulldog with big bat ears.',
  isNew: true,
  palette: { bgA: '#F8F4F2', bgB: '#E6DCD8', accent: '#E5788F', pedestal: '#EEE6E3' },
  grounded: true,
  groundY: 0.42,
  hit: { cx: 0, cy: -0.02, rx: 0.48, ry: 0.46 },
  face: { lx: -0.18, rx: 0.18, y: -0.11, r: 0.095 },
  propFit: { hat: { y: -0.44, s: 0.88 }, side: 0.47, top: -0.46, neck: { y: 0.19, w: 0.5 }, mitten: '#2E292C' },
  lines: {
    hello: ['*snort snort* Hi!', 'Woof! Zoe is here!', '*happy wiggle* Hello hello!'],
    snackFav: ['Cookie!! *happy snorts*', 'A cookie? For ME? Best day!'],
  },
  init: () => ({ earL: appendage(-EAR_SPLAY), earR: appendage(EAR_SPLAY), jowl: appendage(), motion: null }),

  step(s, pose, dt) {
    const [m, motion] = trackMotion(s.motion, pose, dt);
    // Surprised or excited: ears stand tall. Sleepy: they splay out like airplane wings.
    const perk = Math.max(0, pose.brow) * 0.25 + pose.mouthO * 0.2;
    const splay = EAR_SPLAY + (1 - pose.energy) * 0.55 - perk;
    const kick = (m.ay * 0.004 - m.dRot * 0.5) * dt * 4;
    const sway = -m.vx * dt * 5;
    return {
      motion,
      earL: stepAppendage(s.earL, -splay, -kick + sway, dt, 11, 0.24),
      earR: stepAppendage(s.earR, splay, kick + sway, dt, 11, 0.24),
      // Jowls jiggle with every hop and landing.
      jowl: stepAppendage(s.jowl, 0, m.ay * 0.003 * dt * 4, dt, 14, 0.18),
    };
  },

  ambient(particles, pose, dt, center) {
    // Happy snorts: two little puffs from the nose now and then.
    if (pose.energy < 0.3 || Math.random() > dt * (0.12 + pose.happy * 0.5)) return;
    for (const side of [-1, 1]) {
      particles.emit('steam', center.x + side * 0.035, center.y + NOSE_Y + 0.02, { speed: 0.09, spread: 0.6, scale: 0.35 + Math.random() * 0.2 });
    }
  },

  gl(b, pose, s) {
    // haunches behind the chest
    for (const side of [-1, 1]) b.ellipse({ x: side * 0.31, y: 0.32, rx: 0.14, ry: 0.11 }, { ...COAT, depth: 0.14 });
    b.blob(CHEST, COAT);
    b.balls(BLAZE_BALLS, 0.05, BLAZE);
    // front legs, paws, and the white toes on her left paw (viewer's right)
    for (const side of [-1, 1]) {
      b.capsule({ ax: side * 0.2, ay: 0.25, bx: side * 0.2, by: 0.39, r: 0.06 }, { ...COAT, depth: 0.12 });
      b.ellipse({ x: side * 0.205, y: 0.415, rx: 0.078, ry: 0.045 }, { ...COAT, depth: 0.08 });
    }
    b.balls([{ x: 0.18, y: 0.43, r: 0.022 }, { x: 0.21, y: 0.437, r: 0.024 }, { x: 0.24, y: 0.43, r: 0.02 }], 0.015, TOE);

    inHead(b, pose, () => {
      // bat ears (drawn first so the head covers their base)
      for (const [side, ear] of [[-1, s.earL], [1, s.earR]]) {
        b.save();
        b.translate(side * EAR_BASE.x, EAR_BASE.y);
        b.rotate(ear.a);
        b.blob(EAR, { ...COAT, depth: 0.16 });
        b.blob(EAR_INNER, EAR_IN);
        b.restore();
      }
      b.blob(HEAD, COAT);
      // grizzled muzzle and jowls (they jiggle on landings)
      const j = s.jowl.a;
      b.blob({ x: 0, y: 0.1, w: 0.4, h: 0.2, nTop: 2.4, nBottom: 2.2 }, MUZZLE);
      for (const side of [-1, 1]) {
        b.ellipse({ x: side * 0.085, y: 0.13 + j * 0.02, rx: 0.09, ry: 0.068 + j * 0.01 }, { ...MUZZLE, depth: 0.12 });
      }
      b.blob({ x: 0, y: NOSE_Y, w: 0.15, h: 0.085, nTop: 2.6, nBottom: 2 }, NOSE);
    });
  },

  draw(ctx, pose, s) {
    this.gl(new Painter2D(ctx), pose, s);
    this.drawFace(ctx, pose, s);
  },

  drawFace(ctx, pose) {
    const h = headShift(pose);
    ctx.save();
    ctx.translate(h.x, h.y - 0.12);
    ctx.rotate(h.rot);
    ctx.translate(0, 0.12);

    // forehead wrinkles and the soft crease between the eyes
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 0.01;
    for (const [y, w] of [[-0.3, 0.12], [-0.265, 0.09]]) {
      ctx.beginPath(); ctx.moveTo(-w, y + 0.01); ctx.quadraticCurveTo(0, y - 0.015, w, y + 0.01); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 0.008;
    ctx.beginPath(); ctx.moveTo(0, -0.19); ctx.quadraticCurveTo(0.006, -0.11, 0, -0.05); ctx.stroke();

    // salt-and-pepper sugar face
    for (const [x, y, r, a] of FLECKS) {
      ctx.fillStyle = `rgba(236,232,234,${a})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }

    ctx.translate(pose.lean.x * 0.02, pose.lean.y * 0.015);
    drawBlush(ctx, pose, { dx: 0.26, y: 0.03, rx: 0.06, ry: 0.035, color: '#E7849A' });
    drawEyes(ctx, pose, {
      ...this.face, iris: 0.9, reach: 0.28, style: 'sclera', skin: FUR_SKIN, ink: INK,
      sclera: '#F7EAE6', irisIn: '#6A3D24', irisOut: '#160A06', rim: 'rgba(210,110,120,0.55)',
      irisFiber: 'rgba(255,200,150,0.22)',
    });

    // nostrils + a wet highlight on the nose
    ctx.fillStyle = '#050304';
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(side * 0.03, NOSE_Y + 0.012, 0.014, 0.009, side * 0.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath(); ctx.ellipse(-0.025, NOSE_Y - 0.022, 0.026, 0.009, -0.2, 0, Math.PI * 2); ctx.fill();
    // philtrum down to the mouth
    ctx.strokeStyle = 'rgba(10,6,8,0.7)';
    ctx.lineWidth = 0.007;
    ctx.beginPath(); ctx.moveTo(0, NOSE_Y + 0.04); ctx.lineTo(0, 0.12); ctx.stroke();

    drawMouth(ctx, pose, { x: 0, y: 0.14, w: 0.085, ink: INK, inside: '#7A2E3A', tongue: '#F28C9E', line: 0.01 });
    ctx.restore();
  },
};
