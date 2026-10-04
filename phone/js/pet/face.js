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

/**
 * Eyelid geometry. Lids are not painted on top of the eye: the eye is *clipped* to
 * the open region between the lid edges, so whatever is behind (any gradient body,
 * a recessed face plate, a visor) shows through when the eye closes.
 * One continuous curve family covers wide → normal → sleepy → closed "‿".
 */
function lidGeometry(pose, cx, cy, r, side, open) {
  const o = clamp(open, 0, 1);
  const lower = clamp(pose.lower, 0, 1);
  const tilt = pose.tilt;
  const inner = -side; // inner corner faces the nose
  const topMid = lerp(cy + r * 0.5, cy - r * 1.06, o);
  const curve = r * (0.22 + 0.32 * o) * (1 - Math.abs(tilt) * 0.4); // droopy lids stay round, never flat
  const tiltDy = tilt * r * 0.55;
  const botMid = Math.max(topMid + r * 0.02, cy + r * 1.06 - lower * r * 0.62 - (1 - o) * r * 0.52);
  const botCurve = r * (0.08 + 0.36 * lower);
  return {
    o, inner,
    xi: cx + inner * r * 1.15, xo: cx - inner * r * 1.15,
    // Quadratic through the corners with its midpoint at topMid / botMid.
    topInner: topMid - curve + tiltDy, topOuter: topMid - curve - tiltDy, topCtrl: topMid + curve,
    botCorner: botMid + botCurve, botCtrl: botMid - botCurve,
    closed: o < 0.035,
  };
}

function clipOpenRegion(ctx, g) {
  ctx.beginPath();
  ctx.moveTo(g.xi, g.topInner);
  ctx.quadraticCurveTo((g.xi + g.xo) / 2, g.topCtrl, g.xo, g.topOuter);
  ctx.lineTo(g.xo, g.botCorner);
  ctx.quadraticCurveTo((g.xi + g.xo) / 2, g.botCtrl, g.xi, g.botCorner);
  ctx.closePath();
  ctx.clip();
}

/** Lash line along the upper lid: crisp edge while closing, the "‿" when asleep. */
function drawLashLine(ctx, pose, f, g, r) {
  const alpha = smoothstep(0.85, 0.45, g.o) * (f.lidLine ?? 0.85) * (1 - smoothstep(0.15, 0.55, pose.happy));
  if (alpha < 0.01) return;
  const k = 0.82; // keep the line inside the eye's width
  const mx = (g.xi + g.xo) / 2;
  const x0 = mx + (g.xi - mx) * k, x1 = mx + (g.xo - mx) * k;
  const y0 = g.topInner + (g.topCtrl - g.topInner) * (1 - k) * 0.9;
  const y1 = g.topOuter + (g.topCtrl - g.topOuter) * (1 - k) * 0.9;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = f.ink;
  ctx.lineWidth = f.r * (0.08 + 0.05 * (1 - g.o)); // thin while drowsy, bolder when shut
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(mx, g.topCtrl, x1, y1);
  ctx.stroke();
  ctx.restore();
}

function drawHalo(ctx, f, x, y, r0, r1) {
  if (!f.halo) return;
  const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
  g.addColorStop(0, f.halo);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r1, 0, TAU); ctx.fill();
}

function drawScleraEye(ctx, pose, f, cx, side, rawOpen) {
  const cy = f.y;
  const open = clamp(rawOpen * (1 - smoothstep(0.2, 0.75, pose.happy)), 0, 1.35);
  const wide = Math.max(0, open - 1);
  const r = f.r * (1 + wide * 0.32);
  const off = gazeOffset(pose, f, f.r);
  const g = lidGeometry(pose, cx, cy, r, side, open);
  drawHalo(ctx, f, cx, cy, r * 0.4, r * 1.9 * clamp(open + 0.2, 0, 1));

  if (!g.closed) {
    ctx.save();
    clipOpenRegion(ctx, g);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU);
    const sg = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
    sg.addColorStop(0, shade(f.sclera ?? '#ffffff', -0.09));
    sg.addColorStop(0.4, f.sclera ?? '#ffffff');
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
    // Soft shadow the upper lid casts onto the eyeball.
    const shadowY = (g.topInner + g.topOuter) / 2;
    const ls = ctx.createLinearGradient(cx, shadowY, cx, shadowY + r * 0.45);
    ls.addColorStop(0, 'rgba(60,30,20,0.16)');
    ls.addColorStop(1, 'rgba(60,30,20,0)');
    ctx.fillStyle = ls;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
  }

  // The socket rim belongs to an open eye: it fades out for ^ ^ eyes and deep sleep.
  const rimAlpha = (1 - smoothstep(0.15, 0.6, pose.happy)) * (pose.emotion === 'asleep' ? smoothstep(0, 0.3, rawOpen) : 1);
  if (f.rim && rimAlpha > 0.02) {
    ctx.globalAlpha = rimAlpha;
    ctx.strokeStyle = f.rim;
    ctx.lineWidth = f.r * 0.07;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  drawLashLine(ctx, pose, f, g, r);
}

function drawBeadEye(ctx, pose, f, cx, side, rawOpen) {
  const open = clamp(rawOpen * (1 - smoothstep(0.2, 0.75, pose.happy)), 0, 1.35);
  const off = gazeOffset(pose, f, f.r * 0.7);
  const cy = f.y + off.y;
  const ex = cx + off.x;
  const rx = f.r * 0.66 * (1 + Math.max(0, open - 1) * 0.25) * pose.pupil;
  const ry = f.r * 0.82 * (1 + Math.max(0, open - 1) * 0.3) * pose.pupil;
  const g = lidGeometry(pose, ex, cy, ry, side, open);
  drawHalo(ctx, f, ex, cy, ry * 0.3, ry * 2.1 * clamp(open + 0.2, 0, 1));

  if (!g.closed) {
    ctx.save();
    clipOpenRegion(ctx, g);
    ctx.beginPath(); ctx.ellipse(ex, cy, rx, ry, 0, 0, TAU);
    const bg = ctx.createRadialGradient(ex, cy + ry * 0.4, ry * 0.1, ex, cy, ry);
    bg.addColorStop(0, f.irisIn ?? '#4a3040');
    bg.addColorStop(1, f.irisOut ?? '#1f1420');
    ctx.fillStyle = bg;
    ctx.globalAlpha = 1 - pose.dizzy;
    ctx.fill();
    ctx.clip();
    if (pose.dizzy < 0.98) drawHighlights(ctx, pose, ex, cy, Math.min(rx, ry) * 1.05, side);
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  if (pose.dizzy > 0.02) drawSpiral(ctx, ex, cy, ry * 0.85, pose.t * 7 * side, f.ink, pose.dizzy, f.r * 0.11);
  drawLashLine(ctx, pose, f, g, ry);
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
