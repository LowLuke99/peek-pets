// Mochi — the coral daruma from the "simple eyes" sheet. A soft, squashy body with a
// recessed cream face window and big glossy eyes. The default pet.
//   draw(): classic 2D look · gl(): lit clay body parts · drawFace(): eyes/mouth/blush on top

import { blobPath, linear, sheen, clay, recess } from '../shapes.js';
import { drawEyes, drawMouth, drawBlush } from '../face.js';

const SKIN = '#FFE8DA';
const INK = '#3A221C';
const BODY = { x: 0, y: 0, w: 1.02, h: 0.84 };
const BODY_SHAPE = { nTop: 2.15, nBottom: 3.6, flare: 0.13 };
const bodyPath = (ctx) => blobPath(ctx, 0, 0, BODY.w, BODY.h, BODY_SHAPE);
const PLATE = { x: 0, y: -0.07, w: 0.72, h: 0.42 };
const PLATE_SHAPE = { nTop: 2.5, nBottom: 2.4 };

/** The face window follows the head turn a little: a hint of 3-D. */
const plateShift = (pose) => ({ x: pose.lean.x * 0.035, y: pose.lean.y * 0.022 });

export const mochi = {
  id: 'mochi',
  name: 'Mochi',
  blurb: 'Soft, squishy, and always watching your cursor.',
  palette: { bgA: '#FFF3EC', bgB: '#FFDCCD', accent: '#F2735F', pedestal: '#FFE2D6' },
  grounded: true,
  groundY: 0.42,
  hit: { cx: 0, cy: 0, rx: 0.52, ry: 0.44 },
  face: { lx: -0.165, rx: 0.165, y: -0.075, r: 0.1 },
  init: () => ({}),
  step: (s) => s,

  draw(ctx, pose) {
    const lx = pose.lean.x;
    clay(ctx, () => bodyPath(ctx), {
      light: '#FFA894', base: '#F57A65', dark: '#D9504A', rim: 'rgba(255,236,226,0.55)', box: BODY,
    });
    sheen(ctx, -0.2 - lx * 0.04, -0.27, 0.22, 0.1, -0.45, 0.5);
    sheen(ctx, -0.27 - lx * 0.04, -0.24, 0.06, 0.03, -0.6, 0.55);

    const shift = plateShift(pose);
    ctx.save();
    ctx.translate(shift.x, shift.y);
    const plate = () => blobPath(ctx, PLATE.x, PLATE.y, PLATE.w, PLATE.h, PLATE_SHAPE);
    plate();
    ctx.fillStyle = linear(ctx, 0, PLATE.y - PLATE.h / 2, 0, PLATE.y + PLATE.h / 2, [[0, '#FBDCCB'], [0.45, SKIN], [1, '#FFF1E8']]);
    ctx.fill();
    recess(ctx, plate, { shadow: 'rgba(196,92,74,0.42)', depth: 0.026, box: PLATE });
    ctx.save();
    plate();
    ctx.lineWidth = 0.012;
    ctx.strokeStyle = linear(ctx, 0, PLATE.y, 0, PLATE.y + PLATE.h / 2, [[0, 'rgba(255,255,255,0)'], [1, 'rgba(255,255,255,0.75)']]);
    ctx.stroke();
    ctx.restore();
    ctx.restore();
    this.drawFace(ctx, pose);
  },

  /** Lit clay version: one soft coral body and a recessed cream face window. */
  gl(b, pose) {
    b.blob({ ...BODY, ...BODY_SHAPE }, {
      base: 'clay', color: '#FA8772', color2: '#E45F4F', sssColor: '#FF4B36', depth: 0.44,
    });
    const shift = plateShift(pose);
    b.save();
    b.translate(shift.x, shift.y);
    b.blob({ ...PLATE, ...PLATE_SHAPE }, {
      base: 'plate', color: '#F9DDCE', color2: '#FFF0E7', sssColor: '#FFB59C', bevel: 0.045, depth: 0.05,
    });
    b.restore();
  },

  drawFace(ctx, pose) {
    const shift = plateShift(pose);
    ctx.save();
    ctx.translate(shift.x + pose.lean.x * 0.012, shift.y + pose.lean.y * 0.01);
    drawBlush(ctx, pose, { dx: 0.255, y: 0.02, rx: 0.075, ry: 0.042, color: '#FF7F70' });
    drawEyes(ctx, pose, {
      ...this.face, iris: 0.76, reach: 0.32, style: 'sclera',
      skin: SKIN, ink: INK, sclera: '#FFFDFB', irisIn: '#7A4433', irisOut: '#2A1510', rim: 'rgba(214,130,110,0.45)',
    });
    drawMouth(ctx, pose, { x: 0, y: 0.05, w: 0.062, ink: INK, line: 0.011 });
    ctx.restore();
  },
};
