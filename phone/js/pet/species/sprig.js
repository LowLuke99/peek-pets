// Sprig — the mint/charcoal geometric companion from the mascot sheet: a white shell,
// a glossy black visor with glowing mint eyes, springy fins and floating limbs.

import { roundPolyPath, linear, sheen, clay } from '../shapes.js';
import { drawEyes, drawMouth } from '../face.js';
import { trackMotion, stepAppendage, appendage } from '../physics.js';

const VISOR = '#1F2528';
const MINT = '#7FD9B4';
const SHELL_PTS = [{ x: -0.45, y: -0.33 }, { x: 0.45, y: -0.33 }, { x: 0.52, y: 0.02 }, { x: 0.12, y: 0.34 }, { x: -0.12, y: 0.34 }, { x: -0.52, y: 0.02 }];
const VISOR_PTS = SHELL_PTS.map((p) => ({ x: p.x * 0.78, y: p.y * 0.72 + 0.03 }));

export const sprig = {
  id: 'sprig',
  name: 'Sprig',
  blurb: 'A sleek mint bot with a glowing visor face.',
  palette: { bgA: '#F0F7F3', bgB: '#CFE6DA', accent: '#3FAE84', pedestal: '#DDEFE5' },
  grounded: false,
  floatY: 0.5,
  bob: 0.03,
  shadowW: 0.38,
  hit: { cx: 0, cy: 0, rx: 0.5, ry: 0.4 },
  face: { lx: -0.14, rx: 0.14, y: 0.0, r: 0.092 },
  lines: { hello: ['Sprig ready.', 'Hi! *whirr*'], connect: ['Link established: {pc}.'] },
  init: () => ({ finL: appendage(), finR: appendage(), motion: null }),

  step(s, pose, dt) {
    const [m, motion] = trackMotion(s.motion, pose, dt);
    const perk = pose.brow * 0.25 - (1 - pose.energy) * 0.35;
    const kick = (-m.dRot * 0.8 + m.ay * 0.003) * dt * 4;
    return {
      motion,
      finL: stepAppendage(s.finL, -perk, kick - m.vx * dt * 6, dt, 12, 0.25),
      finR: stepAppendage(s.finR, perk, kick - m.vx * dt * 6, dt, 12, 0.25),
    };
  },

  draw(ctx, pose, s) {
    const lx = pose.lean.x, ly = pose.lean.y;
    const t = pose.t;

    // Floating limbs (out of phase with the head bob)
    const limb = (x, y, rot, color, size) => {
      ctx.save();
      ctx.translate(x, y + Math.sin(t * 2 + x * 5) * 0.015);
      ctx.rotate(rot);
      roundPolyPath(ctx, [{ x: 0, y: -size }, { x: size * 0.85, y: size * 0.6 }, { x: -size * 0.85, y: size * 0.6 }], size * 0.25);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
    };
    limb(-0.3, 0.46, -0.5 + Math.sin(t * 1.5) * 0.1 + pose.happy * -0.4, MINT, 0.08);
    limb(0.3, 0.46, 0.5 - Math.sin(t * 1.5) * 0.1 + pose.happy * 0.4, MINT, 0.08);
    limb(0, 0.5, Math.PI, VISOR, 0.07);

    // Fins
    for (const [side, fin] of [[-1, s.finL], [1, s.finR]]) {
      ctx.save();
      ctx.translate(side * 0.33, -0.3);
      ctx.rotate(side * 0.35 + fin.a);
      roundPolyPath(ctx, [{ x: -0.07, y: 0.02 }, { x: side * 0.03, y: -0.2 }, { x: 0.09 * side, y: 0.04 }], 0.03);
      ctx.fillStyle = linear(ctx, 0, -0.2, 0, 0.05, [[0, '#A8F0D2'], [1, '#4FB98F']]);
      ctx.fill();
      ctx.restore();
    }

    const shell = () => roundPolyPath(ctx, SHELL_PTS, 0.16);
    clay(ctx, shell, { light: '#FFFFFF', base: '#ECF1EF', dark: '#B9C6C1', rim: 'rgba(255,255,255,0.8)', ao: 'rgba(40,70,60,0.22)', box: { x: 0, y: 0, w: 1.04, h: 0.67 } });
    sheen(ctx, -0.22, -0.24, 0.17, 0.05, -0.15, 0.8);

    ctx.save();
    ctx.translate(lx * 0.04, ly * 0.025);
    const visor = () => roundPolyPath(ctx, VISOR_PTS, 0.13);
    visor();
    ctx.fillStyle = linear(ctx, 0, -0.22, 0, 0.28, [[0, '#2C3438'], [1, '#151A1C']]);
    ctx.fill();
    ctx.save();
    visor();
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath(); ctx.ellipse(-0.1, -0.2, 0.32, 0.07, -0.08, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.translate(lx * 0.015, ly * 0.01);
    drawEyes(ctx, pose, {
      ...this.face, iris: 0.72, reach: 0.34, skin: VISOR, ink: '#9EF2CF', sclera: '#EAFFF6',
      irisIn: '#62E3B7', irisOut: '#0F6E52', halo: 'rgba(110,240,190,0.28)', lidLine: 0.95,
    });
    drawMouth(ctx, pose, { x: 0, y: 0.13, w: 0.06, ink: '#9EF2CF', inside: '#0C2A22', tongue: '#3FAE84', line: 0.011 });
    ctx.restore();
  },
};
