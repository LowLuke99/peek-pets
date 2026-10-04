// Pebble — a round, mossy stone golem with a sprout on its head (from the Kling concept
// sheet). Heavy and calm: small stubby arms, chunky feet, glowing amber eyes, moss
// patches, and a two-leaf sprout on a spring that bobs with every hop.
//   gl(): clay stone + fluffy moss parts (also painted in 2D by Painter2D)

import { drawEyes, drawMouth, drawBlush } from '../face.js';
import { trackMotion, stepAppendage, appendage } from '../physics.js';
import { Painter2D } from '../paint2d.js';

const SKIN = '#C9D3CB';
const BODY = { x: 0, y: 0, w: 0.82, h: 0.86, nTop: 2.4, nBottom: 3.1, flare: 0.05 };
const STONE = { base: 'clay', color: '#AEBBB2', color2: '#77867E', sssColor: '#C5D6CC', grain: 0.09, spec: 0.12, depth: 0.42 };
const MOSS = { base: 'fluff', color: '#8DB458', color2: '#55782E', sssColor: '#B6E070', grain: 0.12, depth: 0.08 };
const LEAF = { base: 'vinyl', color: '#9FD873', color2: '#5E9E3C', sssColor: '#C8FF8A', depth: 0.04 };
// Moss clumps on the crown and shoulders.
const MOSS_TOP = [{ x: -0.2, y: -0.38, r: 0.09 }, { x: -0.06, y: -0.42, r: 0.1 }, { x: 0.1, y: -0.41, r: 0.09 }, { x: 0.24, y: -0.34, r: 0.08 }, { x: -0.3, y: -0.28, r: 0.06 }, { x: 0.32, y: -0.24, r: 0.05 }];
const MOSS_SIDE = [{ x: 0.24, y: 0.06, r: 0.05 }, { x: 0.32, y: 0.04, r: 0.045 }, { x: 0.28, y: 0.12, r: 0.035 }];

export const pebble = {
  id: 'pebble',
  name: 'Pebble',
  blurb: 'A mossy little stone golem growing a sprout.',
  isNew: true,
  palette: { bgA: '#F2F6EC', bgB: '#D5E3C8', accent: '#6E9A45', pedestal: '#E1EBD6' },
  grounded: true,
  groundY: 0.5,
  hit: { cx: 0, cy: 0, rx: 0.44, ry: 0.46 },
  face: { lx: -0.15, rx: 0.15, y: -0.1, r: 0.105 },
  propFit: { hat: { y: -0.44 }, hands: false, side: 0.44, top: -0.46 },
  lines: { hello: ['*rumble* …hi.', 'Hello, friend.'], snackFav: ['Mmm… crunchy.'], levelup: ['My sprout grew! Level {level}!'] },
  init: () => ({ sprout: appendage(), arms: appendage(), motion: null }),

  step(s, pose, dt) {
    const [m, motion] = trackMotion(s.motion, pose, dt);
    return {
      motion,
      sprout: stepAppendage(s.sprout, Math.sin(pose.t * 0.9) * 0.08 - pose.lean.x * 0.2, (-m.dRot * 0.8 - m.vx * 4 + m.ay * 0.004) * dt * 5, dt, 7, 0.22),
      arms: stepAppendage(s.arms, (pose.wave ?? 0) * 1.6 + (pose.reach ?? 0) * 2 + pose.happy * 0.2, 0, dt, 10, 0.4),
    };
  },

  gl(b, pose, s) {
    for (const side of [-1, 1]) b.ellipse({ x: side * 0.18, y: 0.42, rx: 0.14, ry: 0.08 }, { ...STONE, depth: 0.08 });
    for (const side of [-1, 1]) {
      b.save();
      b.translate(side * 0.4, 0.02);
      b.rotate(side * (0.25 + (side > 0 ? s.arms.a : s.arms.a * 0.4)) * -1);
      b.capsule({ ax: 0, ay: 0, bx: side * 0.03, by: 0.17, r: 0.075 }, { ...STONE, depth: 0.1 });
      b.restore();
    }
    b.blob(BODY, STONE);
    b.ellipse({ x: 0.05, y: 0.2, rx: 0.2, ry: 0.13 }, { ...STONE, color: '#BCC6BF', depth: 0.04, mode: 'bevel', bevel: 0.03 });
    b.balls(MOSS_TOP, 0.05, MOSS);
    b.balls(MOSS_SIDE, 0.04, MOSS);
    b.save();
    b.translate(0, -0.46);
    b.rotate(s.sprout.a);
    b.capsule({ ax: 0, ay: 0, bx: 0, by: -0.14, r: 0.016 }, { ...LEAF, color: '#7DB55A' });
    b.save(); b.translate(-0.07, -0.16); b.rotate(-0.55); b.ellipse({ x: 0, y: 0, rx: 0.08, ry: 0.04 }, LEAF); b.restore();
    b.save(); b.translate(0.08, -0.19); b.rotate(0.6); b.ellipse({ x: 0, y: 0, rx: 0.09, ry: 0.045 }, LEAF); b.restore();
    b.restore();
  },

  draw(ctx, pose, s) {
    this.gl(new Painter2D(ctx), pose, s);
    this.drawFace(ctx, pose, s);
  },

  drawFace(ctx, pose) {
    // a few cracks and pebbles in the stone
    ctx.strokeStyle = 'rgba(70,84,76,0.35)';
    ctx.lineWidth = 0.008;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-0.3, 0.12); ctx.lineTo(-0.24, 0.17); ctx.lineTo(-0.26, 0.24); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0.12, 0.28); ctx.lineTo(0.18, 0.25); ctx.stroke();
    ctx.save();
    ctx.translate(pose.lean.x * 0.04, pose.lean.y * 0.025);
    drawBlush(ctx, pose, { dx: 0.25, y: -0.01, rx: 0.065, ry: 0.035, color: '#E89A7A' });
    drawEyes(ctx, pose, {
      ...this.face, iris: 0.86, reach: 0.3, skin: SKIN, ink: '#2E2A22', sclera: '#FFF8E8',
      irisIn: '#FFB23E', irisOut: '#7A3C05', rim: 'rgba(90,70,40,0.4)', irisFiber: 'rgba(255,230,160,0.3)',
      halo: 'rgba(255,190,80,0.25)',
    });
    drawMouth(ctx, pose, { x: 0, y: 0.04, w: 0.05, ink: '#2E2A22', line: 0.011 });
    ctx.restore();
  },
};
