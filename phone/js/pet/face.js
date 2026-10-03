// Shared face parts. Species describe *where* and *what colors*; these functions
// handle the animation-aware drawing of eyes, lids, mouth, brows and blush.
// All coordinates are in pet units (body ≈ 1 unit wide), already transformed.

import { clamp, smoothstep, lerp } from '../core/spring.js';

const TAU = Math.PI * 2;

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} pose rig output
 * @param {{lx:number, rx:number, y:number, r:number, iris?:number, reach?:number, style?:'sclera'|'bead',
 *          skin:string, ink:string, irisIn?:string, irisOut?:string, sclera?:string, halo?:string,
 *          rim?:string, lidLine?:number}} f
 */
export function drawEyes(ctx, pose, f) {
  for (const side of [-1, 1]) {
    const open = side < 0 ? pose.eyeL : pose.eyeR;
    const cx = side < 0 ? f.lx : f.rx;
    if (f.style === 'bead') drawBeadEye(ctx, pose, f, cx, side, open);
    else drawScleraEye(ctx, pose, f, cx, side, open);
    drawHappyArc(ctx, pose, f, cx);
  }
}

function gazeOffset(pose, f, r) {
  const reach = (f.reach ?? 0.42) * r;
  return { x: pose.gaze.x * reach, y: pose.gaze.y * reach * 0.82 };
}

function drawScleraEye(ctx, pose, f, cx, side, rawOpen) {
  const cy = f.y;
  const open = clamp(rawOpen * (1 - smoothstep(0.2, 0.75, pose.happy)), 0, 1.35);
  const wide = Math.max(0, open - 1);
  const r = f.r * (1 + wide * 0.32);
  const off = gazeOffset(pose, f, f.r);

  if (f.halo) {
    const g = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 1.9);
    g.addColorStop(0, f.halo);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.9, 0, TAU); ctx.fill();
  }

  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU);
  const sg = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
  sg.addColorStop(0, shade(f.sclera ?? '#ffffff', -0.07));
  sg.addColorStop(0.35, f.sclera ?? '#ffffff');
  ctx.fillStyle = sg;
  ctx.fill();
  ctx.clip();

  // Iris + pupil, foreshortened as they rotate away from center.
  const ir = f.r * (f.iris ?? 0.72) * pose.pupil;
  const fx = 1 - 0.16 * Math.min(1, Math.abs(pose.gaze.x));
  const fy = 1 - 0.1 * Math.min(1, Math.abs(pose.gaze.y));
  const ix = cx + off.x, iy = cy + off.y;
  const dizzy = pose.dizzy;
  if (dizzy < 0.98) {
    ctx.globalAlpha = 1 - dizzy;
    const ig = ctx.createRadialGradient(ix, iy + ir * 0.35, ir * 0.1, ix, iy, ir);
    ig.addColorStop(0, f.irisIn ?? '#6b3a2c');
    ig.addColorStop(1, f.irisOut ?? '#2e1813');
    ctx.fillStyle = ig;
    ctx.beginPath(); ctx.ellipse(ix, iy, ir * fx, ir * fy, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = f.pupilColor ?? 'rgba(20,10,8,0.85)';
    ctx.beginPath(); ctx.ellipse(ix, iy, ir * 0.5 * fx, ir * 0.5 * fy, 0, 0, TAU); ctx.fill();
    drawHighlights(ctx, pose, cx + off.x * 0.6, cy + off.y * 0.6, ir, side);
    ctx.globalAlpha = 1;
  }
  if (dizzy > 0.02) drawSpiral(ctx, cx, cy, r * 0.78, pose.t * 7 * side, f.ink, dizzy, f.r * 0.11);

  drawLids(ctx, pose, f, cx, cy, r, side, open);
  ctx.restore();

  if (f.rim) {
    ctx.strokeStyle = f.rim;
    ctx.lineWidth = f.r * 0.07;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
  }
}

function drawBeadEye(ctx, pose, f, cx, side, rawOpen) {
  const open = clamp(rawOpen * (1 - smoothstep(0.2, 0.75, pose.happy)), 0, 1.35);
  const off = gazeOffset(pose, f, f.r * 0.7);
  const cy = f.y + off.y;
  const ex = cx + off.x;
  const rx = f.r * 0.66 * (1 + Math.max(0, open - 1) * 0.25) * pose.pupil;
  const ry = f.r * 0.82 * (1 + Math.max(0, open - 1) * 0.3) * pose.pupil;

  if (f.halo) {
    const g = ctx.createRadialGradient(ex, cy, ry * 0.3, ex, cy, ry * 2.1);
    g.addColorStop(0, f.halo);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(ex, cy, ry * 2.1, 0, TAU); ctx.fill();
  }
  ctx.save();
  ctx.beginPath(); ctx.ellipse(ex, cy, rx, ry, 0, 0, TAU);
  const bg = ctx.createRadialGradient(ex, cy + ry * 0.4, ry * 0.1, ex, cy, ry);
  bg.addColorStop(0, f.irisIn ?? '#4a3040');
  bg.addColorStop(1, f.irisOut ?? '#1f1420');
  ctx.fillStyle = bg;
  ctx.globalAlpha = 1 - pose.dizzy;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.clip();
  if (pose.dizzy < 0.98) {
    ctx.globalAlpha = 1 - pose.dizzy;
    drawHighlights(ctx, pose, ex, cy, Math.min(rx, ry) * 1.05, side);
    ctx.globalAlpha = 1;
  }
  drawLids(ctx, pose, f, ex, cy, ry, side, open);
  ctx.restore();
  if (pose.dizzy > 0.02) drawSpiral(ctx, ex, cy, ry * 0.85, pose.t * 7 * side, f.ink, pose.dizzy, f.r * 0.11);
}

/** Skin-colored lids closing from above/below, with tilt for worried/determined. */
function drawLids(ctx, pose, f, cx, cy, r, side, open) {
  const o = clamp(open, 0, 1);
  const lower = clamp(pose.lower, 0, 1);
  const tilt = pose.tilt;
  const inner = -side; // inner corner faces the nose
  const yTop = lerp(cy + r * 0.52, cy - r * 1.04, o);
  const yBot = cy + r * 1.04 - lower * r * 0.62 - (1 - o) * r * 0.5;
  const tiltDy = tilt * r * 0.55;
  const edgeInnerY = yTop + tiltDy;
  const edgeOuterY = yTop - tiltDy;
  const xi = cx + inner * (r + 2);
  const xo = cx - inner * (r + 2);
  // Lids wrap around the eyeball: a strongly curved edge reads friendly, a flat
  // one reads bored. Curvature relaxes as the lid closes into the sleeping "‿".
  const sag = r * (0.18 + 0.42 * o) * (1 - Math.abs(tilt) * 0.6);

  ctx.fillStyle = f.skin;
  if (yTop > cy - r * 1.02 || Math.abs(tilt) > 0.02) {
    ctx.beginPath();
    ctx.moveTo(xo, cy - r * 1.6);
    ctx.lineTo(xi, cy - r * 1.6);
    ctx.lineTo(xi, edgeInnerY);
    ctx.quadraticCurveTo(cx, yTop + sag, xo, edgeOuterY);
    ctx.closePath();
    ctx.fill();
    // Lash line gives the closing lid a crisp edge (and is the sleeping "‿" line).
    const lineAlpha = smoothstep(0.82, 0.5, o) * (f.lidLine ?? 0.85) * (1 - smoothstep(0.15, 0.55, pose.happy));
    if (lineAlpha > 0.01) {
      ctx.strokeStyle = f.ink;
      ctx.globalAlpha = lineAlpha;
      ctx.lineWidth = f.r * 0.13;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(xi - inner * 2, edgeInnerY);
      ctx.quadraticCurveTo(cx, yTop + sag, xo + inner * 2, edgeOuterY);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  if (yBot < cy + r * 1.02) {
    ctx.beginPath();
    ctx.moveTo(cx - r - 2, cy + r * 1.6);
    ctx.lineTo(cx + r + 2, cy + r * 1.6);
    ctx.lineTo(cx + r + 2, yBot + r * 0.25);
    ctx.quadraticCurveTo(cx, yBot - r * (0.15 + 0.45 * lower), cx - r - 2, yBot + r * 0.25);
    ctx.closePath();
    ctx.fill();
  }
}

function drawHighlights(ctx, pose, x, y, ir, side) {
  const sp = pose.sparkle;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  const bx = x - ir * 0.34, by = y - ir * 0.4;
  if (sp > 0.5) drawStar(ctx, bx, by, ir * 0.42, pose.t * 1.5);
  else { ctx.beginPath(); ctx.arc(bx, by, ir * 0.3, 0, TAU); ctx.fill(); }
  ctx.globalAlpha *= 0.85;
  ctx.beginPath(); ctx.arc(x + ir * 0.3 * (side < 0 ? 1 : 1), y + ir * 0.3, ir * 0.12, 0, TAU); ctx.fill();
}

function drawHappyArc(ctx, pose, f, cx) {
  const a = smoothstep(0.3, 0.85, pose.happy);
  if (a < 0.01) return;
  const w = f.r * 0.95, h = f.r * 0.62;
  const y = f.y + f.r * 0.22;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = f.ink;
  ctx.lineWidth = f.r * 0.24;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - w, y);
  ctx.quadraticCurveTo(cx, y - h * 2, cx + w, y);
  ctx.stroke();
  ctx.restore();
}

function drawSpiral(ctx, cx, cy, r, rot, ink, alpha, width) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = ink;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i <= 48; i++) {
    const a = rot + (i / 48) * Math.PI * 5;
    const d = (i / 48) * r;
    const px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.restore();
}

export function drawStar(ctx, x, y, r, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = rot + (i * Math.PI) / 4;
    const d = i % 2 === 0 ? r : r * 0.32;
    ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  ctx.closePath();
  ctx.fill();
}

/**
 * @param {{x:number, y:number, w:number, ink:string, inside?:string, tongue?:string, line?:number}} m
 */
export function drawMouth(ctx, pose, m) {
  const w = m.w;
  const s = pose.smile;
  const o = clamp(pose.mouthOpen, 0, 1);
  const round = clamp(pose.mouthO, 0, 1);
  const lw = m.line ?? w * 0.16;
  ctx.save();
  ctx.translate(m.x, m.y);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = m.ink;
  ctx.lineWidth = lw;

  if (round > 0.35 && round >= o) {
    const rx = w * (0.18 + 0.1 * round), ry = w * (0.16 + 0.2 * round);
    fillMouthInterior(ctx, m, () => { ctx.beginPath(); ctx.ellipse(0, ry * 0.3, rx, ry, 0, 0, TAU); }, ry);
    ctx.restore();
    return;
  }
  const cornerY = -s * w * 0.2;
  const midY = s * w * 0.32;
  if (o < 0.05) {
    ctx.beginPath();
    ctx.moveTo(-w / 2, cornerY);
    ctx.quadraticCurveTo(0, midY * 1.6, w / 2, cornerY);
    ctx.stroke();
  } else {
    const ww = w * (1 + o * 0.15);
    const upper = cornerY + s * w * 0.12;
    const lowerY = upper + o * w * 1.05 + Math.max(0, s) * w * 0.25;
    fillMouthInterior(ctx, m, () => {
      ctx.beginPath();
      ctx.moveTo(-ww / 2, cornerY);
      ctx.quadraticCurveTo(0, upper, ww / 2, cornerY);
      ctx.quadraticCurveTo(0, lowerY, -ww / 2, cornerY);
      ctx.closePath();
    }, lowerY * 0.6);
  }
  ctx.restore();
}

function fillMouthInterior(ctx, m, path, depth) {
  path();
  ctx.fillStyle = m.inside ?? '#7a2f33';
  ctx.fill();
  ctx.save();
  path();
  ctx.clip();
  ctx.fillStyle = m.tongue ?? '#ff8b8b';
  ctx.beginPath();
  ctx.ellipse(0, depth + m.w * 0.22, m.w * 0.32, m.w * 0.24, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  path();
  ctx.lineWidth = (m.line ?? m.w * 0.16) * 0.7;
  ctx.stroke();
}

/** @param {{dx:number, y:number, rx:number, ry:number, color:string}} b */
export function drawBlush(ctx, pose, b) {
  const a = clamp(pose.blush, 0, 1);
  if (a < 0.02) return;
  for (const side of [-1, 1]) {
    const x = side * b.dx;
    const g = ctx.createRadialGradient(x, b.y, 0, x, b.y, b.rx);
    g.addColorStop(0, withAlpha(b.color, 0.75 * a));
    g.addColorStop(1, withAlpha(b.color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, b.y, b.rx, b.ry, 0, 0, TAU);
    ctx.fill();
  }
}

/** @param {{dx:number, y:number, w:number, ink:string, thick:number}} br */
export function drawBrows(ctx, pose, br) {
  const raise = pose.brow * br.w * 0.35;
  ctx.save();
  ctx.strokeStyle = br.ink;
  ctx.lineWidth = br.thick;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    const cx = side * br.dx;
    const tiltDy = pose.tilt * br.w * 0.35;
    const innerX = cx - side * br.w * 0.5;
    const outerX = cx + side * br.w * 0.5;
    const y = br.y - raise;
    ctx.beginPath();
    ctx.moveTo(innerX, y + tiltDy);
    ctx.quadraticCurveTo(cx, y - br.w * 0.22, outerX, y - tiltDy * 0.4);
    ctx.stroke();
  }
  ctx.restore();
}

// ---- color helpers -----------------------------------------------------------
export function withAlpha(hex, a) {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r},${g},${b},${a})`;
}

export function shade(hex, amount) {
  const { r, g, b } = parseHex(hex);
  const f = (c) => Math.round(clamp(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount, 0, 255));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

const hexCache = new Map();
function parseHex(hex) {
  let v = hexCache.get(hex);
  if (v) return v;
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  v = { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  hexCache.set(hex, v);
  return v;
}
