// Puff — a sleepy little cloud. Its weather is its mood: a drizzle while it waits for
// your PC, a rainbow when it's overjoyed.
//   draw(): classic 2D look · gl(): soft metaball cloud · drawBack(): rainbow · drawFace()

import { radial, linear } from '../shapes.js';
import { drawEyes, drawMouth, drawBlush } from '../face.js';

const SKIN = '#F4F1FF';
const PUFFS = [[-0.27, 0.06, 0.2], [-0.12, -0.08, 0.25], [0.12, -0.12, 0.27], [0.29, 0.04, 0.2], [0, 0.1, 0.27], [-0.2, 0.17, 0.15], [0.2, 0.17, 0.15]];
const RAINBOW = ['#FF8A8A', '#FFC56E', '#FFF08A', '#8FE3A6', '#8EC5FF', '#B39BFF'];

const puffR = (t, x, r, breathe) => r * (1 + Math.sin(t * 1.3 + x * 9) * 0.02 * breathe);

function cloudPath(ctx, t, breathe) {
  ctx.beginPath();
  for (const [x, y, r] of PUFFS) {
    const rr = puffR(t, x, r, breathe);
    ctx.moveTo(x + rr, y);
    ctx.arc(x, y, rr, 0, Math.PI * 2);
  }
}

export const puff = {
  id: 'puff',
  name: 'Puff',
  blurb: 'A drowsy cloud whose weather is its mood.',
  palette: { bgA: '#F3F4FF', bgB: '#D6DAF7', accent: '#7C7FE0', pedestal: '#E3E5FA' },
  grounded: false,
  floatY: 0.5,
  bob: 0.045,
  shadowW: 0.4,
  hit: { cx: 0, cy: 0.02, rx: 0.52, ry: 0.36 },
  face: { lx: -0.13, rx: 0.13, y: 0.02, r: 0.08 },
  lines: { hello: ['Hiii~', '*floats over*'], disconnect: ['Looks like rain…'], wake: ['Mmh… five more minutes…'] },
  init: () => ({}),
  step: (s) => s,

  ambient(particles, pose, dt, center) {
    const gloomy = pose.emotion === 'waiting' || pose.emotion === 'worried';
    if (gloomy && Math.random() < dt * 9) {
      particles.emit('rain', center.x + (Math.random() - 0.5) * 0.6, center.y + 0.28, { speed: 0.6, angle: Math.PI / 2, spread: 0.05 });
    }
  },

  draw(ctx, pose) {
    this.drawBack(ctx, pose);
    const path = () => cloudPath(ctx, pose.t, pose.calm);
    path();
    ctx.fillStyle = radial(ctx, 0, 0.0, 0, 0.6, [[0, '#FFFFFF'], [0.55, '#F2EFFF'], [1, '#C9C2EE']], -0.15, -0.25);
    ctx.fill();
    ctx.save();
    path();
    ctx.clip();
    ctx.fillStyle = linear(ctx, 0, 0.05, 0, 0.35, [[0, 'rgba(150,140,210,0)'], [1, 'rgba(150,140,210,0.35)']]);
    ctx.fillRect(-0.6, -0.4, 1.2, 0.8);
    ctx.restore();
    this.drawFace(ctx, pose);
  },

  /** Behind the cloud (the GL renderer draws this on its back layer). */
  drawBack(ctx, pose) {
    const rainbow = Math.max(pose.happy, pose.sparkle) * 0.9;
    if (rainbow <= 0.05) return;
    ctx.save();
    ctx.globalAlpha = rainbow * 0.75;
    ctx.lineWidth = 0.035;
    RAINBOW.forEach((c, i) => {
      ctx.strokeStyle = c;
      ctx.beginPath(); ctx.arc(0, 0.12, 0.62 - i * 0.035, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    });
    ctx.restore();
  },

  gl(b, pose) {
    b.balls(PUFFS.map(([x, y, r]) => ({ x, y, r: puffR(pose.t, x, r, pose.calm) })), 0.06, {
      base: 'cloud', color: '#FFFFFF', color2: '#D8D2F4', sssColor: '#EDE6FF', bevel: 0.16, depth: 0.25,
    });
  },

  drawFace(ctx, pose) {
    ctx.save();
    ctx.translate(pose.lean.x * 0.05, pose.lean.y * 0.03);
    drawBlush(ctx, pose, { dx: 0.22, y: 0.09, rx: 0.065, ry: 0.035, color: '#FF9DB8' });
    drawEyes(ctx, pose, {
      ...this.face, style: 'bead', reach: 0.42, skin: SKIN, ink: '#2A2C66',
      irisIn: '#4A4E95', irisOut: '#1B1D48',
    });
    drawMouth(ctx, pose, { x: 0, y: 0.11, w: 0.05, ink: '#2A2C66', inside: '#5A3D7A', tongue: '#FF9DB8', line: 0.01 });
    ctx.restore();
  },
};
