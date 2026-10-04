// Nimbus — the luminous blue jelly from the mascot sheet. Floats, glows brighter when
// happy, sways a curly tail, and lets off little bubbles.

import { blobPath, radial, sheen, wave } from '../shapes.js';
import { drawEyes, drawMouth, drawBlush, drawStar } from '../face.js';
import { trackMotion, stepAppendage, appendage } from '../physics.js';

const SKIN = '#B9E0FF';
const SPECKS = [[-0.2, 0.08, 0.012], [0.22, 0.12, 0.01], [0.05, 0.22, 0.008], [-0.06, -0.24, 0.009], [0.27, -0.12, 0.011], [-0.3, -0.06, 0.008]];

export const nimbus = {
  id: 'nimbus',
  name: 'Nimbus',
  blurb: 'A glowy jelly spirit that floats and shimmers.',
  palette: { bgA: '#EEF4FF', bgB: '#CCDDFB', accent: '#5B8DEF', pedestal: '#DCE7FF' },
  grounded: false,
  floatY: 0.46,
  bob: 0.04,
  shadowW: 0.36,
  hit: { cx: 0, cy: 0, rx: 0.46, ry: 0.42 },
  face: { lx: -0.15, rx: 0.15, y: -0.02, r: 0.095 },
  lines: { hello: ['Blub! Hello~', '*shimmers*'], dizzy: ['Wobble wobble…'] },
  init: () => ({ tail: appendage(), fin: appendage(), motion: null, bubble: 0 }),

  step(s, pose, dt) {
    const [m, motion] = trackMotion(s.motion, pose, dt);
    return {
      ...s, motion,
      tail: stepAppendage(s.tail, Math.sin(pose.t * 1.3) * 0.12, (-m.dRot * 0.7 - m.vx * 3) * dt * 5, dt, 7, 0.3),
      fin: stepAppendage(s.fin, Math.sin(pose.t * 2.2) * 0.25 + pose.happy * 0.5, (-m.vy * 2) * dt * 5, dt, 9, 0.25),
    };
  },

  ambient(particles, pose, dt, center) {
    if (Math.random() < dt * (0.5 + pose.energy)) {
      particles.emit('bubble', center.x + (Math.random() - 0.5) * 0.6, center.y + 0.2, { speed: 0.2, scale: 0.6 + Math.random() });
    }
  },

  draw(ctx, pose, s) {
    const lx = pose.lean.x, ly = pose.lean.y;
    const glow = 0.35 + pose.energy * 0.45;
    ctx.fillStyle = radial(ctx, 0, 0, 0.1, 0.75, [[0, `rgba(170,215,255,${glow})`], [1, 'rgba(170,215,255,0)']]);
    ctx.beginPath(); ctx.arc(0, 0, 0.75, 0, Math.PI * 2); ctx.fill();

    // Curly tail rising from the top of the head
    ctx.save();
    ctx.translate(-0.04, -0.28);
    ctx.rotate(-0.25 + s.tail.a);
    const tip = wave(pose.t * 0.8, 3) * 0.02;
    ctx.beginPath();
    ctx.moveTo(-0.12, 0.06);
    ctx.bezierCurveTo(-0.2, -0.2, -0.02, -0.42, 0.16 + tip, -0.36);
    ctx.bezierCurveTo(0.26 + tip, -0.32, 0.22, -0.2, 0.12, -0.22);
    ctx.bezierCurveTo(0.2, -0.26, 0.17, -0.31, 0.12, -0.3);
    ctx.bezierCurveTo(0.0, -0.3, -0.04, -0.12, 0.12, 0.06);
    ctx.closePath();
    ctx.fillStyle = radial(ctx, 0, -0.1, 0.02, 0.4, [[0, '#E9F6FF'], [0.6, '#B4DCFF'], [1, '#86B9F2']]);
    ctx.fill();
    ctx.restore();

    // Jelly body
    blobPath(ctx, 0, 0, 0.88, 0.76, { nTop: 2.05, nBottom: 2.5, flare: 0.06 });
    ctx.fillStyle = radial(ctx, 0, 0.05, 0, 0.55, [[0, '#F1FAFF'], [0.45, '#BFE3FF'], [1, '#7DB2F0']], -0.15, -0.2);
    ctx.globalAlpha = 0.95;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.clip();
    ctx.fillStyle = radial(ctx, 0, 0.18, 0, 0.35, [[0, `rgba(255,255,255,${0.25 + glow * 0.3})`], [1, 'rgba(255,255,255,0)']]);
    ctx.fillRect(-0.5, -0.4, 1, 0.8);
    ctx.lineWidth = 0.06;
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    blobPath(ctx, 0, 0, 0.88, 0.76, { nTop: 2.05, nBottom: 2.5, flare: 0.06 });
    ctx.stroke();
    ctx.restore();
    for (const [x, y, r] of SPECKS) {
      ctx.globalAlpha = 0.45 + 0.45 * Math.sin(pose.t * 2.3 + x * 20);
      ctx.fillStyle = '#FFFFFF';
      drawStar(ctx, x, y, r * 2.2, 0);
    }
    ctx.globalAlpha = 1;
    sheen(ctx, -0.2, -0.22, 0.17, 0.08, -0.5, 0.75);

    // Little fin arm
    ctx.save();
    ctx.translate(0.3, 0.22);
    ctx.rotate(0.5 - s.fin.a);
    ctx.fillStyle = 'rgba(160,205,250,0.95)';
    ctx.beginPath(); ctx.ellipse(0.08, 0, 0.11, 0.05, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(lx * 0.05, ly * 0.03);
    drawBlush(ctx, pose, { dx: 0.24, y: 0.07, rx: 0.07, ry: 0.04, color: '#C49BFF' });
    drawEyes(ctx, pose, {
      ...this.face, iris: 0.78, reach: 0.34, skin: SKIN, ink: '#1E2A6B',
      irisIn: '#5B86F0', irisOut: '#15216A', rim: 'rgba(110,160,230,0.35)',
    });
    drawMouth(ctx, pose, { x: 0, y: 0.1, w: 0.06, ink: '#28306E', inside: '#5B3DAE', tongue: '#B88CFF', line: 0.011 });
    ctx.restore();
  },
};
