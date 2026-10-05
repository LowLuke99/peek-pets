// Bloop — a puffy pufferfish (from the ChatGPT ocean sheet + turnaround). A round golden
// balloon fading to a cream belly, covered in soft little spikes, with fan fins at the
// sides and a tail fin peeking out behind. Puffs up big (spikes out!) when surprised or
// excited, deflates into a soft squishy ball when sleepy. Trails the odd bubble.
//   gl(): glossy vinyl body + jelly fins (also painted in 2D by Painter2D)

import { drawEyes, drawMouth, drawBlush } from '../face.js';
import { trackMotion, stepAppendage, appendage } from '../physics.js';
import { Painter2D } from '../paint2d.js';

const TAU = Math.PI * 2;
const SKIN = '#FFE7BC';
const R = 0.4; // body radius at rest
const BODY_GL = { base: 'vinyl', color: '#FFBE5C', color2: '#FFF8EC', sssColor: '#FFD9A0', grad: 1.0, spec: 0.42, depth: 0.46 };
const BODY_2D = { base: 'vinyl', color: '#FFD992', color2: '#F0A848' };
const SPIKE = { base: 'vinyl', color: '#FFC255', color2: '#E9952C', sssColor: '#FFD27A', depth: 0.05, spec: 0.3 };
const FIN = { base: 'jelly', color: '#FFD58C', color2: '#F3A94A', sssColor: '#FFE2A8', alpha: 0.86, depth: 0.05, emissive: 0.06 };
// Spikes around the outline (angles, radians from +x; the fins hide 0 and π).
const RIM = [-1.57, -1.2, -0.85, -0.5, -0.2, 0.42, 0.75, 1.05, 1.35, 1.79, 2.09, 2.39, 2.72, 3.34, 3.64, 3.99, 4.34];
// Spikes on the front of the body (x, y), avoiding the face.
const FRONT = [[-0.19, -0.29], [0.0, -0.33], [0.19, -0.29], [-0.33, -0.08], [0.33, -0.08], [-0.27, 0.11],
  [0.27, 0.11], [-0.12, 0.19], [0.12, 0.19], [-0.24, 0.26], [0.24, 0.26], [0.0, 0.3]];

/** 0 = deflated, ~0.35 = relaxed, 1 = fully puffed. */
const bodyScale = (puff) => 0.9 + puff * 0.17;

/** One spike as a little triangle pointing away from the body centre. */
function spike(b, x, y, len, width) {
  const d = Math.hypot(x, y) || 1;
  const ux = x / d, uy = y / d;
  const px = -uy * width, py = ux * width;
  b.poly([{ x: x + px, y: y + py }, { x: x + ux * len, y: y + uy * len }, { x: x - px, y: y - py }], width * 0.45, SPIKE);
}

function fin(b, side, a) {
  b.save();
  b.translate(side * R * 0.93, -0.01);
  b.rotate(side * (-0.15 + a));
  b.scale(side, 1);
  b.poly([{ x: -0.02, y: -0.05 }, { x: 0.12, y: -0.12 }, { x: 0.19, y: -0.04 }, { x: 0.19, y: 0.05 }, { x: 0.12, y: 0.11 }, { x: -0.02, y: 0.05 }], 0.035, FIN);
  b.restore();
}

export const bloop = {
  id: 'bloop',
  name: 'Bloop',
  blurb: 'A puffy pufferfish who puffs up when surprised.',
  isNew: true,
  palette: { bgA: '#FFF7EC', bgB: '#FFE1C4', accent: '#EE9A34', pedestal: '#FFEBD8' },
  grounded: false,
  floatY: 0.5,
  bob: 0.045,
  shadowW: 0.36,
  hit: { cx: 0, cy: 0, rx: 0.46, ry: 0.44 },
  face: { lx: -0.16, rx: 0.16, y: -0.08, r: 0.105 },
  propFit: { hat: { y: -0.37 }, side: 0.44, top: -0.42 },
  lines: { hello: ['Bloop bloop! Hi!', '*puffs up* Oh! It\'s you!'], snackFav: ['Boba!! Bubbles in a cup!'] },
  init: () => ({ puff: appendage(0.35), fins: appendage(), tail: appendage(), motion: null }),

  step(s, pose, dt) {
    const [m, motion] = trackMotion(s.motion, pose, dt);
    const surprised = pose.emotion === 'surprised' ? 1 : Math.max(0, pose.mouthO - 0.4) * 1.5;
    const target = pose.energy < 0.3 ? 0.02 : Math.min(1, 0.32 + pose.happy * 0.22 + surprised * 0.75 + (pose.dancing ? 0.2 : 0));
    const flutter = Math.sin(pose.t * (5 + pose.energy * 7)) * (0.12 + pose.energy * 0.16) + (pose.wave ?? 0) * 0.6;
    return {
      motion,
      puff: stepAppendage(s.puff, target, -m.ay * dt * 0.0015, dt, 9, 0.32),
      fins: stepAppendage(s.fins, flutter, -m.vy * dt * 3, dt, 18, 0.35),
      tail: stepAppendage(s.tail, Math.sin(pose.t * 2.4) * 0.18, (-m.dRot - m.vx * 3) * dt * 5, dt, 9, 0.28),
    };
  },

  ambient(particles, pose, dt, center) {
    if (Math.random() < dt * (0.35 + pose.energy * 0.4)) {
      const side = Math.random() < 0.5 ? -1 : 1;
      particles.emit('bubble', center.x + side * (0.5 + Math.random() * 0.08), center.y - 0.06, { speed: 0.16, scale: 0.6 + Math.random() * 0.7 });
    }
  },

  gl(b, pose, s) {
    const puff = s.puff.a;
    const k = bodyScale(puff);
    const is2D = b instanceof Painter2D;
    // tail fin peeking out behind, lower right
    b.save();
    b.translate(0.24, 0.24);
    b.rotate(0.85 + s.tail.a);
    b.scale(0.75);
    b.poly([{ x: 0, y: -0.04 }, { x: 0.16, y: -0.13 }, { x: 0.13, y: 0.0 }, { x: 0.16, y: 0.12 }, { x: 0, y: 0.04 }], 0.03, FIN);
    b.restore();
    for (const side of [-1, 1]) fin(b, side, side < 0 ? s.fins.a : -s.fins.a);
    b.save();
    b.scale(k, k);
    // outline spikes stand up as it puffs
    const len = 0.02 + Math.max(0, Math.min(1.1, puff)) * 0.06;
    for (const a of RIM) spike(b, Math.cos(a) * R * 0.9, Math.sin(a) * R * 0.9, len + R * 0.1, 0.03);
    b.ellipse({ x: 0, y: 0, rx: R, ry: R * 0.97 }, is2D ? BODY_2D : BODY_GL);
    if (is2D) belly(b.ctx);
    // front spikes are foreshortened: almost dots near the middle, longer toward the edges
    for (const [x, y] of FRONT) {
      const d = Math.hypot(x, y) / R;
      spike(b, x, y, (0.012 + len * 0.55) * d, 0.022);
    }
    b.restore();
  },

  draw(ctx, pose, s) {
    this.gl(new Painter2D(ctx), pose, s);
    this.drawFace(ctx, pose, s);
  },

  drawFace(ctx, pose, s) {
    // fin ribs (only where the fins stick out past the body)
    const k = bodyScale(s.puff.a);
    ctx.save();
    ctx.beginPath();
    ctx.rect(-1, -1, 2, 2);
    ctx.ellipse(0, 0, R * k, R * 0.97 * k, 0, 0, TAU);
    ctx.clip('evenodd');
    ctx.strokeStyle = 'rgba(214,128,40,0.45)';
    ctx.lineWidth = 0.007;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * R * 0.93, -0.01);
      ctx.rotate(side * (-0.15 + (side < 0 ? s.fins.a : -s.fins.a)));
      ctx.scale(side, 1);
      for (const ry of [-0.08, -0.03, 0.02, 0.07]) {
        ctx.beginPath(); ctx.moveTo(0.02, ry * 0.3); ctx.lineTo(0.16, ry); ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
    ctx.save();
    ctx.translate(pose.lean.x * 0.05, pose.lean.y * 0.03);
    drawBlush(ctx, pose, { dx: 0.24, y: 0.06, rx: 0.075, ry: 0.042, color: '#FF8F86' });
    drawEyes(ctx, pose, {
      ...this.face, iris: 0.84, reach: 0.32, skin: SKIN, ink: '#3A2010', sclera: '#FFFFFF',
      irisIn: '#B8732E', irisOut: '#2A1206', rim: 'rgba(150,90,30,0.35)', irisFiber: 'rgba(255,220,160,0.28)',
    });
    drawMouth(ctx, pose, { x: 0, y: 0.04, w: 0.075, ink: '#5A2A14', inside: '#B2433F', tongue: '#FF8C8C', line: 0.011 });
    ctx.restore();
  },
};

/** Classic look only: the cream belly fading in under the golden top (GL does this with grad). */
function belly(ctx) {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, R, R * 0.97, 0, 0, TAU);
  ctx.clip();
  const g = ctx.createLinearGradient(0, -0.05, 0, R);
  g.addColorStop(0, 'rgba(255,246,228,0)');
  g.addColorStop(0.45, 'rgba(255,246,228,0.85)');
  g.addColorStop(1, 'rgba(250,232,200,0.95)');
  ctx.fillStyle = g;
  ctx.fillRect(-R, -0.05, R * 2, R + 0.05);
  ctx.restore();
}
