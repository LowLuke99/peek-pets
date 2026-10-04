// Pip — the cream/coral robot from the mascot + expression sheets: glowing headphone
// ears, a springy antenna, brows, and a little torso with a chest light.

import { blobPath, roundRectPath, sheen, clay, recess, radial } from '../shapes.js';
import { drawEyes, drawMouth, drawBlush, drawBrows } from '../face.js';
import { trackMotion, stepAppendage, appendage } from '../physics.js';

const CREAM = { light: '#FFFFFF', base: '#F3E7DF', dark: '#D5BFB2' };
const CORAL = '#F2735F';
const INK = '#3E2117';
const PANEL = '#FFF7F1';
const HEAD = { x: 0, y: -0.1, w: 0.86, h: 0.64 };
const FACE = { x: 0, y: -0.07, w: 0.62, h: 0.44 };

export const pip = {
  id: 'pip',
  name: 'Pip',
  blurb: 'A curious little robot with glowing ears.',
  palette: { bgA: '#FFF4EE', bgB: '#FFD9CC', accent: '#F2735F', pedestal: '#FFE1D5' },
  grounded: true,
  groundY: 0.46,
  hit: { cx: 0, cy: -0.02, rx: 0.48, ry: 0.48 },
  face: { lx: -0.13, rx: 0.13, y: -0.07, r: 0.088 },
  lines: { hello: ['Beep! Hi!', 'Systems happy!', 'Pip online!'], connect: ['Signal locked: {pc}!', 'Beep boop, found {pc}!'] },
  init: () => ({ antenna: appendage(), motion: null }),

  step(s, pose, dt) {
    const [m, motion] = trackMotion(s.motion, pose, dt);
    const kick = (-m.dRot * 0.9 - m.vx * 2.2 + m.ay * 0.004) * dt * 4;
    return { motion, antenna: stepAppendage(s.antenna, -pose.rot * 0.4, kick, dt, 12, 0.22) };
  },

  draw(ctx, pose, s) {
    const lx = pose.lean.x, ly = pose.lean.y;
    const glow = 0.45 + 0.4 * pose.energy + (pose.dancing ? 0.25 * Math.sin(pose.t * 12) : 0);

    // Torso + arms (behind the head)
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * 0.31, 0.3);
      ctx.rotate(side * (0.25 + (pose.dancing ? Math.sin(pose.t * 11.7 + side) * 0.35 : 0) + pose.happy * 0.25));
      roundRectPath(ctx, -0.055, -0.03, 0.11, 0.17, 0.055);
      ctx.fillStyle = CREAM.base; ctx.fill();
      roundRectPath(ctx, -0.056, 0.06, 0.112, 0.045, 0.02);
      ctx.fillStyle = CORAL; ctx.fill();
      ctx.restore();
    }
    const torso = () => roundRectPath(ctx, -0.29, 0.14, 0.58, 0.32, 0.15);
    clay(ctx, torso, { ...CREAM, box: { x: 0, y: 0.3, w: 0.58, h: 0.32 } });
    ctx.fillStyle = radial(ctx, 0, 0.31, 0, 0.06, [[0, '#FFB39F'], [0.7, CORAL], [1, '#D9574A']], -0.015, 0.295);
    ctx.beginPath(); ctx.arc(0, 0.31, 0.058, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4A2A22';
    ctx.beginPath(); ctx.ellipse(0, 0.16, 0.15, 0.045, 0, 0, Math.PI * 2); ctx.fill();

    // Antenna (springy)
    ctx.save();
    ctx.translate(lx * 0.02, HEAD.y - HEAD.h / 2 + 0.02);
    ctx.rotate(s.antenna.a);
    ctx.strokeStyle = '#5A3428'; ctx.lineWidth = 0.022; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -0.13); ctx.stroke();
    ctx.fillStyle = radial(ctx, 0, -0.16, 0, 0.05, [[0, '#FFC2B2'], [0.6, CORAL], [1, '#D9574A']], -0.015, -0.175);
    ctx.beginPath(); ctx.arc(0, -0.16, 0.048, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Head
    const head = () => blobPath(ctx, HEAD.x, HEAD.y, HEAD.w, HEAD.h, { nTop: 2.3, nBottom: 2.7 });
    clay(ctx, head, { ...CREAM, rim: 'rgba(255,255,255,0.7)', ao: 'rgba(120,70,50,0.2)', box: HEAD });
    ctx.strokeStyle = 'rgba(190,150,130,0.35)'; ctx.lineWidth = 0.008;
    ctx.beginPath(); ctx.ellipse(0, HEAD.y + 0.04, 0.4, 0.33, 0, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    sheen(ctx, -0.18, -0.33, 0.16, 0.06, -0.3, 0.7);

    // Headphone ears with glow rings
    for (const side of [-1, 1]) {
      const x = side * 0.43, y = -0.08;
      ctx.fillStyle = radial(ctx, x, y, 0, 0.17, [[0, '#FF9A85'], [0.7, CORAL], [1, '#C94B40']], x - side * 0.03, y - 0.05);
      ctx.beginPath(); ctx.ellipse(x, y, 0.085, 0.155, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(255,214,150,${glow})`; ctx.lineWidth = 0.018;
      ctx.beginPath(); ctx.ellipse(x + side * 0.012, y, 0.045, 0.09, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = `rgba(255,190,120,${glow * 0.35})`;
      ctx.beginPath(); ctx.ellipse(x + side * 0.012, y, 0.07, 0.13, 0, 0, Math.PI * 2); ctx.fill();
    }

    // Face panel
    ctx.save();
    ctx.translate(lx * 0.04, ly * 0.025);
    const panel = () => blobPath(ctx, FACE.x, FACE.y, FACE.w, FACE.h, { nTop: 2.4, nBottom: 2.6 });
    panel(); ctx.fillStyle = PANEL; ctx.fill();
    recess(ctx, panel, { shadow: 'rgba(170,120,100,0.3)', depth: 0.018, box: FACE });
    ctx.translate(lx * 0.012, ly * 0.01);
    drawBlush(ctx, pose, { dx: 0.215, y: 0.03, rx: 0.065, ry: 0.036, color: '#FF8A7A' });
    drawBrows(ctx, pose, { dx: 0.13, y: -0.18, w: 0.085, ink: '#7A4636', thick: 0.014 });
    drawEyes(ctx, pose, {
      ...this.face, iris: 0.8, reach: 0.34, skin: PANEL, ink: INK,
      irisIn: '#D9783E', irisOut: '#4A1D0C', rim: 'rgba(190,140,120,0.35)',
    });
    drawMouth(ctx, pose, { x: 0, y: 0.065, w: 0.055, ink: INK, line: 0.01 });
    ctx.restore();
  },
};
