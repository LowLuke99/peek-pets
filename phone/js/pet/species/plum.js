// Plum — the starry plum orb with a peach ribbon ring from the mascot sheet. The ring
// orbits in 3-D: its back half is drawn behind the body, the front half over it.
//   draw(): classic 2D look · gl(): glossy orb + ring parts · drawFace(): stars + face

import { radial, sheen, clay } from '../shapes.js';
import { drawEyes, drawMouth, drawBlush } from '../face.js';
import { trackMotion, stepAppendage, appendage } from '../physics.js';

const SKIN = '#5E3A4E';
const LIGHT_INK = '#FFE1CC';
const STARS = [[-0.24, -0.2], [0.2, -0.26], [0.3, 0.06], [-0.3, 0.12], [0.08, 0.28], [-0.1, -0.32], [0.26, 0.24]];
const RING = { rx: 0.6, ry: 0.16, tilt: -0.28, w: 0.07 };
const PEACH = { base: 'vinyl', color: '#FFCB98', color2: '#F59A6A', sssColor: '#FFB070', spec: 0.6, depth: 0.1, mode: 'bevel', bevel: 0.035 };
const moonAt = (t) => { const a = t * 0.9; return { x: Math.cos(a) * RING.rx, y: Math.sin(a) * RING.ry, front: Math.sin(a) > 0 }; };

function ring(ctx, t, front) {
  const { rx, ry, tilt } = RING;
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
  const moon = moonAt(t);
  if (moon.front === front) {
    ctx.fillStyle = radial(ctx, moon.x, moon.y, 0, 0.05, [[0, '#FFE3C8'], [1, '#E69A6A']], moon.x - 0.012, moon.y - 0.015);
    ctx.beginPath(); ctx.arc(moon.x, moon.y, 0.038, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function glRing(b, t, front) {
  b.save();
  b.rotate(RING.tilt);
  b.ring({ x: 0, y: 0, rx: RING.rx, ry: RING.ry, w: RING.w, half: front ? 1 : -1 }, PEACH);
  const moon = moonAt(t);
  if (moon.front === front) b.ellipse({ x: moon.x, y: moon.y, rx: 0.038, ry: 0.038 }, { base: 'clay', color: '#FFE0C2', color2: '#E69A6A', sssColor: '#FFB070', depth: 0.04 });
  b.restore();
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
    ring(ctx, pose.t, false);
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
    sheen(ctx, -0.16, -0.22, 0.15, 0.07, -0.6, 0.45);
    this.drawFace(ctx, pose, s);
    ring(ctx, pose.t, true);
  },

  gl(b, pose, s) {
    glRing(b, pose.t, false);
    b.save();
    b.translate(-0.12, -0.33);
    b.rotate(s.antenna.a);
    b.capsule({ ax: 0, ay: 0, bx: 0, by: -0.12, r: 0.011 }, { base: 'metal', color: '#4A2C3E', color2: '#2E1A26' });
    b.ellipse({ x: 0, y: -0.15, rx: 0.05, ry: 0.05 }, { base: 'glass', color: '#F7B07E', color2: '#C8704A', sssColor: '#FFB070', emissive: 0.1 });
    b.restore();
    b.ellipse({ x: 0, y: 0, rx: 0.4, ry: 0.4 }, {
      base: 'vinyl', color: '#6E4860', color2: '#3A2232', sssColor: '#C0507A', spec: 0.65, shine: 90, rim: 0.7, sss: 0.5, depth: 0.42,
    });
    glRing(b, pose.t, true);
  },

  glow() {
    return { x: 0, y: 0, r: 0.75, color: '#FFB08A', strength: 0.07 };
  },

  drawFace(ctx, pose) {
    for (const [x, y] of STARS) {
      ctx.globalAlpha = 0.35 + 0.55 * Math.max(0, Math.sin(pose.t * 1.7 + x * 13 + y * 7));
      ctx.fillStyle = '#FFE9D6';
      ctx.beginPath(); ctx.arc(x, y, 0.009, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(pose.lean.x * 0.05, pose.lean.y * 0.035);
    drawBlush(ctx, pose, { dx: 0.22, y: 0.07, rx: 0.065, ry: 0.035, color: '#FF8FB0' });
    drawEyes(ctx, { ...pose, sparkle: Math.max(pose.sparkle, 0.65) }, {
      ...this.face, iris: 0.78, reach: 0.34, skin: SKIN, ink: LIGHT_INK,
      irisIn: '#E7A062', irisOut: '#4A2412', rim: 'rgba(40,15,30,0.5)', lidLine: 0.95,
    });
    drawMouth(ctx, pose, { x: 0, y: 0.1, w: 0.058, ink: LIGHT_INK, inside: '#2A0F1C', tongue: '#FF8FA8', line: 0.011 });
    ctx.restore();
  },
};
