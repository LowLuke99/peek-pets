// Plum — the starry plum orb with a peach ribbon ring from the mascot sheet. The ring
// orbits in 3-D: its back half is drawn behind the body, the front half over it.

import { radial, sheen, clay } from '../shapes.js';
import { drawEyes, drawMouth, drawBlush } from '../face.js';
import { trackMotion, stepAppendage, appendage } from '../physics.js';

const SKIN = '#5E3A4E';
const LIGHT_INK = '#FFE1CC';
const STARS = [[-0.24, -0.2], [0.2, -0.26], [0.3, 0.06], [-0.3, 0.12], [0.08, 0.28], [-0.1, -0.32], [0.26, 0.24]];

function ring(ctx, t, front) {
  const rx = 0.6, ry = 0.16, tilt = -0.28;
  ctx.save();
  ctx.rotate(tilt);
  ctx.lineCap = 'round';
  const from = front ? 0 : Math.PI, to = front ? Math.PI : Math.PI * 2;
  const g = ctx.createLinearGradient(-rx, 0, rx, 0);
  g.addColorStop(0, 'rgba(255,190,140,0.55)');
  g.addColorStop(0.5, 'rgba(255,215,170,0.95)');
  g.addColorStop(1, 'rgba(255,170,120,0.6)');
  ctx.strokeStyle = g;
  ctx.lineWidth = 0.07;
  ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, from, to); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,245,225,0.7)';
  ctx.lineWidth = 0.012;
  ctx.beginPath(); ctx.ellipse(0, -0.012, rx, ry, 0, from, to); ctx.stroke();
  // A tiny moon riding the ring
  const a = t * 0.9;
  const inFront = Math.sin(a) > 0;
  if (inFront === front) {
    const mx = Math.cos(a) * rx, my = Math.sin(a) * ry;
    ctx.fillStyle = radial(ctx, mx, my, 0, 0.05, [[0, '#FFE3C8'], [1, '#E69A6A']], mx - 0.012, my - 0.015);
    ctx.beginPath(); ctx.arc(mx, my, 0.038, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

export const plum = {
  id: 'plum',
  name: 'Plum',
  blurb: 'A cosmic little orb with its own orbiting ring.',
  palette: { bgA: '#F7EEF6', bgB: '#E2CDE6', accent: '#B7608A', pedestal: '#EEDDF0' },
  grounded: false,
  floatY: 0.46,
  bob: 0.03,
  shadowW: 0.34,
  hit: { cx: 0, cy: 0, rx: 0.44, ry: 0.42 },
  face: { lx: -0.14, rx: 0.14, y: -0.01, r: 0.098 },
  lines: { hello: ['Greetings, earthling!', '*twinkle*'], connect: ['Orbit locked on {pc}!'] },
  init: () => ({ antenna: appendage(-0.3), motion: null }),

  step(s, pose, dt) {
    const [m, motion] = trackMotion(s.motion, pose, dt);
    const kick = (-m.dRot * 0.9 - m.vx * 2.5 + m.vy * 0.6) * dt * 4;
    return { motion, antenna: stepAppendage(s.antenna, -0.3 - pose.rot * 0.4, kick, dt, 11, 0.22) };
  },

  draw(ctx, pose, s) {
    const lx = pose.lean.x, ly = pose.lean.y;
    ring(ctx, pose.t, false);

    // Antenna
    ctx.save();
    ctx.translate(-0.12, -0.33);
    ctx.rotate(s.antenna.a);
    ctx.strokeStyle = '#3A2232'; ctx.lineWidth = 0.022; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -0.12); ctx.stroke();
    ctx.fillStyle = radial(ctx, 0, -0.15, 0, 0.055, [[0, '#FFD9BC'], [0.6, '#F0A070'], [1, '#C8704A']], -0.015, -0.165);
    ctx.beginPath(); ctx.arc(0, -0.15, 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    const body = () => { ctx.beginPath(); ctx.arc(0, 0, 0.4, 0, Math.PI * 2); };
    clay(ctx, body, {
      light: '#9A6880', base: '#5E3A4E', dark: '#2E1A26', rim: 'rgba(255,200,170,0.45)', ao: 'rgba(20,5,15,0.3)',
      box: { x: 0, y: 0, w: 0.8, h: 0.8 },
    });
    for (const [x, y] of STARS) {
      ctx.globalAlpha = 0.35 + 0.55 * Math.max(0, Math.sin(pose.t * 1.7 + x * 13 + y * 7));
      ctx.fillStyle = '#FFE9D6';
      ctx.beginPath(); ctx.arc(x, y, 0.009, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    sheen(ctx, -0.16, -0.22, 0.15, 0.07, -0.6, 0.45);

    ctx.save();
    ctx.translate(lx * 0.05, ly * 0.035);
    drawBlush(ctx, pose, { dx: 0.22, y: 0.07, rx: 0.065, ry: 0.035, color: '#FF8FB0' });
    drawEyes(ctx, { ...pose, sparkle: Math.max(pose.sparkle, 0.65) }, {
      ...this.face, iris: 0.78, reach: 0.34, skin: SKIN, ink: LIGHT_INK,
      irisIn: '#E7A062', irisOut: '#4A2412', rim: 'rgba(40,15,30,0.5)', lidLine: 0.95,
    });
    drawMouth(ctx, pose, { x: 0, y: 0.1, w: 0.058, ink: LIGHT_INK, inside: '#2A0F1C', tongue: '#FF8FA8', line: 0.011 });
    ctx.restore();

    ring(ctx, pose.t, true);
  },
};
