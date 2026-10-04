// Bun — a marshmallow bunny. Long ears on springs flop with every hop and droop when
// it's sleepy; perk straight up when surprised.
//   draw(): classic 2D look · gl(): fluffy marshmallow parts · drawFace(): face on top

import { blobPath, sheen, clay, radial } from '../shapes.js';
import { drawEyes, drawMouth, drawBlush } from '../face.js';
import { trackMotion, stepAppendage, appendage } from '../physics.js';

const SKIN = '#FBEADF';
const BODY = { x: 0, y: 0, w: 0.84, h: 0.72 };
const BODY_SHAPE = { nTop: 2.1, nBottom: 3.1, flare: 0.08 };
const FLUFF = { base: 'fluff', color: '#FFF6EF', color2: '#ECD3C6', sssColor: '#FFC2B4' };

export const bun = {
  id: 'bun',
  name: 'Bun',
  blurb: 'A marshmallow bunny with very floppy ears.',
  isNew: true,
  palette: { bgA: '#FFF6F2', bgB: '#F9DCE0', accent: '#E8789A', pedestal: '#FBE4E6' },
  grounded: true,
  groundY: 0.36,
  hit: { cx: 0, cy: 0, rx: 0.44, ry: 0.4 },
  face: { lx: -0.15, rx: 0.15, y: -0.02, r: 0.085 },
  propFit: { mitten: '#F6DCD0' },
  lines: { hello: ['*nose wiggle* Hi!', 'Boing! Hello!'] },
  init: () => ({ earL: appendage(-0.2), earR: appendage(0.2), motion: null }),

  step(s, pose, dt) {
    const [m, motion] = trackMotion(s.motion, pose, dt);
    const droop = (1 - pose.energy) * 0.9 - Math.max(0, pose.brow) * 0.25;
    const kick = (m.ay * 0.0045 - m.dRot * 0.6) * dt * 4;
    const sway = -m.vx * dt * 7;
    return {
      motion,
      earL: stepAppendage(s.earL, -0.2 - droop, -kick + sway, dt, 9, 0.2),
      earR: stepAppendage(s.earR, 0.2 + droop, kick + sway, dt, 9, 0.2),
    };
  },

  draw(ctx, pose, s) {
    const lx = pose.lean.x;
    for (const [side, ear] of [[-1, s.earL], [1, s.earR]]) {
      ctx.save();
      ctx.translate(side * 0.15 + lx * 0.02, -0.27);
      ctx.rotate(ear.a);
      ctx.fillStyle = radial(ctx, 0, -0.2, 0, 0.3, [[0, '#FFFFFF'], [0.6, '#FBEDE4'], [1, '#E5C3B4']], -side * 0.03, -0.3);
      ctx.beginPath(); ctx.ellipse(0, -0.2, 0.085, 0.24, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = radial(ctx, 0, -0.18, 0, 0.18, [[0, '#FFB7C5'], [1, '#F48FAA']]);
      ctx.beginPath(); ctx.ellipse(0, -0.19, 0.042, 0.17, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    const body = () => blobPath(ctx, BODY.x, BODY.y, BODY.w, BODY.h, BODY_SHAPE);
    clay(ctx, body, { light: '#FFFFFF', base: '#FBEADF', dark: '#E3BFAE', rim: 'rgba(255,255,255,0.8)', ao: 'rgba(150,80,70,0.22)', box: BODY });
    sheen(ctx, -0.17, -0.22, 0.16, 0.07, -0.5, 0.75);
    for (const side of [-1, 1]) {
      ctx.fillStyle = radial(ctx, side * 0.17, 0.33, 0, 0.1, [[0, '#FFFFFF'], [1, '#EBCFC1']]);
      ctx.beginPath(); ctx.ellipse(side * 0.17, 0.33, 0.1, 0.05, 0, 0, Math.PI * 2); ctx.fill();
    }
    this.drawFace(ctx, pose, s);
  },

  gl(b, pose, s) {
    for (const [side, ear] of [[-1, s.earL], [1, s.earR]]) {
      b.save();
      b.translate(side * 0.15 + pose.lean.x * 0.02, -0.27);
      b.rotate(ear.a);
      b.ellipse({ x: 0, y: -0.2, rx: 0.085, ry: 0.24 }, { ...FLUFF, depth: 0.12 });
      b.ellipse({ x: 0, y: -0.19, rx: 0.042, ry: 0.17 }, { base: 'fluff', color: '#FFB3C2', color2: '#EE8AA6', sssColor: '#FF7090', depth: 0.03, ao: 0.05 });
      b.restore();
    }
    b.blob({ ...BODY, ...BODY_SHAPE }, { ...FLUFF, depth: 0.4 });
    for (const side of [-1, 1]) b.ellipse({ x: side * 0.17, y: 0.33, rx: 0.1, ry: 0.05 }, { ...FLUFF, depth: 0.05 });
  },

  drawFace(ctx, pose) {
    ctx.save();
    ctx.translate(pose.lean.x * 0.045, pose.lean.y * 0.03);
    drawBlush(ctx, pose, { dx: 0.23, y: 0.07, rx: 0.07, ry: 0.04, color: '#FF8FAE' });
    drawEyes(ctx, pose, {
      ...this.face, style: 'bead', reach: 0.4, skin: SKIN, ink: '#3B2430',
      irisIn: '#5A3646', irisOut: '#1E1018',
    });
    ctx.fillStyle = '#F07895';
    ctx.beginPath();
    ctx.moveTo(-0.022, 0.045); ctx.quadraticCurveTo(0, 0.035, 0.022, 0.045); ctx.quadraticCurveTo(0, 0.075, -0.022, 0.045);
    ctx.fill();
    drawMouth(ctx, pose, { x: 0, y: 0.09, w: 0.05, ink: '#3B2430', line: 0.01 });
    ctx.restore();
  },
};
