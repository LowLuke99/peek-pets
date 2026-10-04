// Pip — the cream/coral robot from the mascot + expression sheets: glowing headphone
// ears, a springy antenna, brows, and a little torso with a chest light.
//   draw(): classic 2D look · gl(): lit vinyl parts · drawFace(): face on top

import { blobPath, roundRectPath, sheen, clay, recess, radial } from '../shapes.js';
import { drawEyes, drawMouth, drawBlush, drawBrows } from '../face.js';
import { trackMotion, stepAppendage, appendage } from '../physics.js';

const CREAM = { light: '#FFFFFF', base: '#F3E7DF', dark: '#D5BFB2' };
const CORAL = '#F2735F';
const INK = '#3E2117';
const PANEL = '#FFF7F1';
const HEAD = { x: 0, y: -0.1, w: 0.86, h: 0.64 };
const FACE = { x: 0, y: -0.07, w: 0.62, h: 0.44 };
const VINYL_CREAM = { base: 'vinyl', color: '#F6ECE5', color2: '#E9D9CE', sssColor: '#FFD9C4' };
const VINYL_CORAL = { base: 'vinyl', color: '#F7826D', color2: '#DC5A4B', sssColor: '#FF5A40' };

const glowOf = (pose) => 0.45 + 0.4 * pose.energy + (pose.dancing ? 0.25 * Math.sin(pose.t * 12) : 0);
const armAngle = (pose, side) => side * (0.25 + (pose.dancing ? Math.sin(pose.t * 11.7 + side) * 0.35 : 0) + pose.happy * 0.25 + (pose.reach ?? 0) * 1.6)
  + (side > 0 ? (pose.wave ?? 0) * (2.2 + Math.sin(pose.t * 12) * 0.45) + (pose.point ?? 0) * 1.5 : 0);
const panelShift = (pose) => ({ x: pose.lean.x * 0.04, y: pose.lean.y * 0.025 });

export const pip = {
  id: 'pip',
  name: 'Pip',
  blurb: 'A curious little robot with glowing ears.',
  palette: { bgA: '#FFF4EE', bgB: '#FFD9CC', accent: '#F2735F', pedestal: '#FFE1D5' },
  grounded: true,
  groundY: 0.46,
  hit: { cx: 0, cy: -0.02, rx: 0.48, ry: 0.48 },
  face: { lx: -0.13, rx: 0.13, y: -0.07, r: 0.088 },
  propFit: { headphones: false, hands: false, top: -0.42, side: 0.43 }, // already has headphones and arms
  lines: { hello: ['Beep! Hi!', 'Systems happy!', 'Pip online!'], connect: ['Signal locked: {pc}!', 'Beep boop, found {pc}!'] },
  init: () => ({ antenna: appendage(), motion: null }),

  step(s, pose, dt) {
    const [m, motion] = trackMotion(s.motion, pose, dt);
    const kick = (-m.dRot * 0.9 - m.vx * 2.2 + m.ay * 0.004) * dt * 4;
    return { motion, antenna: stepAppendage(s.antenna, -pose.rot * 0.4, kick, dt, 12, 0.22) };
  },

  draw(ctx, pose, s) {
    const lx = pose.lean.x;
    const glow = glowOf(pose);

    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * 0.31, 0.3);
      ctx.rotate(armAngle(pose, side));
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

    ctx.save();
    ctx.translate(lx * 0.02, HEAD.y - HEAD.h / 2 + 0.02);
    ctx.rotate(s.antenna.a);
    ctx.strokeStyle = '#5A3428'; ctx.lineWidth = 0.022; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -0.13); ctx.stroke();
    ctx.fillStyle = radial(ctx, 0, -0.16, 0, 0.05, [[0, '#FFC2B2'], [0.6, CORAL], [1, '#D9574A']], -0.015, -0.175);
    ctx.beginPath(); ctx.arc(0, -0.16, 0.048, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    const head = () => blobPath(ctx, HEAD.x, HEAD.y, HEAD.w, HEAD.h, { nTop: 2.3, nBottom: 2.7 });
    clay(ctx, head, { ...CREAM, rim: 'rgba(255,255,255,0.7)', ao: 'rgba(120,70,50,0.2)', box: HEAD });
    ctx.strokeStyle = 'rgba(190,150,130,0.35)'; ctx.lineWidth = 0.008;
    ctx.beginPath(); ctx.ellipse(0, HEAD.y + 0.04, 0.4, 0.33, 0, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    sheen(ctx, -0.18, -0.33, 0.16, 0.06, -0.3, 0.7);

    for (const side of [-1, 1]) {
      const x = side * 0.43, y = -0.08;
      ctx.fillStyle = radial(ctx, x, y, 0, 0.17, [[0, '#FF9A85'], [0.7, CORAL], [1, '#C94B40']], x - side * 0.03, y - 0.05);
      ctx.beginPath(); ctx.ellipse(x, y, 0.085, 0.155, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(255,214,150,${glow})`; ctx.lineWidth = 0.018;
      ctx.beginPath(); ctx.ellipse(x + side * 0.012, y, 0.045, 0.09, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = `rgba(255,190,120,${glow * 0.35})`;
      ctx.beginPath(); ctx.ellipse(x + side * 0.012, y, 0.07, 0.13, 0, 0, Math.PI * 2); ctx.fill();
    }

    const shift = panelShift(pose);
    ctx.save();
    ctx.translate(shift.x, shift.y);
    const panel = () => blobPath(ctx, FACE.x, FACE.y, FACE.w, FACE.h, { nTop: 2.4, nBottom: 2.6 });
    panel(); ctx.fillStyle = PANEL; ctx.fill();
    recess(ctx, panel, { shadow: 'rgba(170,120,100,0.3)', depth: 0.018, box: FACE });
    ctx.restore();
    this.drawFace(ctx, pose, s);
  },

  gl(b, pose, s) {
    const glow = glowOf(pose);
    for (const side of [-1, 1]) {
      b.save();
      b.translate(side * 0.31, 0.3);
      b.rotate(armAngle(pose, side));
      b.rrect({ x: 0, y: 0.055, w: 0.11, h: 0.17, r: 0.055 }, { ...VINYL_CREAM, depth: 0.1, mode: 'bevel', bevel: 0.05 });
      b.rrect({ x: 0, y: 0.0825, w: 0.114, h: 0.047, r: 0.022 }, { ...VINYL_CORAL, mode: 'bevel', bevel: 0.02 });
      b.restore();
    }
    b.rrect({ x: 0, y: 0.3, w: 0.58, h: 0.32, r: 0.15 }, { ...VINYL_CREAM, mode: 'bevel', bevel: 0.13, depth: 0.2 });
    b.ellipse({ x: 0, y: 0.31, rx: 0.058, ry: 0.058 }, { base: 'glass', color: '#FF8C74', color2: '#E0503F', sssColor: '#FF6A40', emissive: 0.15 + glow * 0.25 });
    b.ellipse({ x: 0, y: 0.16, rx: 0.15, ry: 0.045 }, { base: 'flat', color: '#4A2A22', alpha: 0.95 });

    b.save();
    b.translate(pose.lean.x * 0.02, HEAD.y - HEAD.h / 2 + 0.02);
    b.rotate(s.antenna.a);
    b.capsule({ ax: 0, ay: 0, bx: 0, by: -0.13, r: 0.011 }, { base: 'metal', color: '#6A4032', color2: '#4A2A22' });
    b.ellipse({ x: 0, y: -0.16, rx: 0.048, ry: 0.048 }, { base: 'glass', color: '#FF8C74', color2: '#D9574A', sssColor: '#FF6A40', emissive: 0.1 + glow * 0.2 });
    b.restore();

    b.blob({ ...HEAD, nTop: 2.3, nBottom: 2.7 }, { ...VINYL_CREAM, depth: 0.36 });
    for (const side of [-1, 1]) {
      const x = side * 0.43, y = -0.08;
      b.ellipse({ x, y, rx: 0.085, ry: 0.155 }, { ...VINYL_CORAL, depth: 0.12 });
      b.ring({ x: x + side * 0.012, y, rx: 0.045, ry: 0.09, w: 0.02 }, { base: 'glass', color: '#FFD9A0', sssColor: '#FFC070', emissive: 0.4 + glow * 0.7, alpha: Math.min(1, 0.5 + glow * 0.5), mode: 'bevel', bevel: 0.01 });
    }
    const shift = panelShift(pose);
    b.save();
    b.translate(shift.x, shift.y);
    b.blob({ ...FACE, nTop: 2.4, nBottom: 2.6 }, { base: 'plate', color: '#FBEFE8', color2: '#FFF8F3', sssColor: '#FFD9C4', bevel: 0.035 });
    b.restore();
  },

  glow(pose) {
    return { x: 0, y: -0.1, r: 0.85, color: '#FFB48A', strength: 0.08 + glowOf(pose) * 0.08 };
  },

  drawFace(ctx, pose) {
    const shift = panelShift(pose);
    ctx.save();
    ctx.translate(shift.x + pose.lean.x * 0.012, shift.y + pose.lean.y * 0.01);
    drawBlush(ctx, pose, { dx: 0.215, y: 0.03, rx: 0.065, ry: 0.036, color: '#FF8A7A' });
    drawBrows(ctx, pose, { dx: 0.13, y: -0.18, w: 0.085, ink: '#7A4636', thick: 0.014 });
    drawEyes(ctx, pose, {
      ...this.face, iris: 0.8, reach: 0.34, skin: PANEL, ink: INK,
      irisIn: '#D9783E', irisOut: '#4A1D0C', rim: 'rgba(190,140,120,0.35)', irisFiber: 'rgba(255,230,180,0.2)',
    });
    drawMouth(ctx, pose, { x: 0, y: 0.065, w: 0.055, ink: INK, line: 0.01 });
    ctx.restore();
  },
};
