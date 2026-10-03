// Procedural body shapes. Everything is built from math so bodies can squash,
// flicker and wobble per frame instead of being stiff images.

const TAU = Math.PI * 2;

/**
 * Superellipse "blob" centered at (cx, cy). Separate exponents for top/bottom let
 * one function make domes, daruma shapes, pebbles and drops.
 */
export function blobPath(ctx, cx, cy, w, h, opts = {}) {
  const { nTop = 2.3, nBottom = 3, flare = 0, top = 1, segments = 72, wobble = null } = opts;
  ctx.beginPath();
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * TAU;
    const c = Math.cos(a), s = Math.sin(a);
    const n = s > 0 ? nBottom : nTop;
    const ex = Math.sign(c) * Math.abs(c) ** (2 / n);
    const ey = Math.sign(s) * Math.abs(s) ** (2 / n);
    const k = wobble ? 1 + wobble(a) : 1;
    let x = (ex * w) / 2 * (1 + flare * ey) * k;
    let y = (ey * h) / 2 * k;
    if (ey < 0) y *= top;
    if (i === 0) ctx.moveTo(cx + x, cy + y);
    else ctx.lineTo(cx + x, cy + y);
  }
  ctx.closePath();
}

export function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Rounded polygon through points (each corner rounded by radius r). */
export function roundPolyPath(ctx, pts, r) {
  ctx.beginPath();
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const v1 = norm(p0.x - p1.x, p0.y - p1.y), v2 = norm(p2.x - p1.x, p2.y - p1.y);
    const a = { x: p1.x + v1.x * r, y: p1.y + v1.y * r };
    const b = { x: p1.x + v2.x * r, y: p1.y + v2.y * r };
    if (i === 0) ctx.moveTo(a.x, a.y); else ctx.lineTo(a.x, a.y);
    ctx.quadraticCurveTo(p1.x, p1.y, b.x, b.y);
  }
  ctx.closePath();
}

function norm(x, y) {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
}

export function radial(ctx, x, y, r0, r1, stops, ox = x, oy = y) {
  const g = ctx.createRadialGradient(ox, oy, r0, x, y, r1);
  for (const [at, color] of stops) g.addColorStop(at, color);
  return g;
}

export function linear(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [at, color] of stops) g.addColorStop(at, color);
  return g;
}

/** Soft white sheen used on glossy bodies. */
export function sheen(ctx, x, y, rx, ry, rot, alpha) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(255,255,255,${alpha})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.scale(1, ry / rx);
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/**
 * Soft "clay toy" shading for a body path: key light from the upper left, a cool
 * bounce/rim on the edge, and occlusion where it meets the ground.
 * @param {() => void} path re-issues the body path
 */
export function clay(ctx, path, { light, base, dark, rim = 'rgba(255,255,255,0.5)', ao = 'rgba(90,30,30,0.28)', box }) {
  const { x, y, w, h } = box;
  path();
  ctx.fillStyle = radial(ctx, x + w * 0.05, y + h * 0.1, 0, Math.max(w, h) * 0.75,
    [[0, light], [0.45, base], [1, dark]], x - w * 0.22, y - h * 0.3);
  ctx.fill();
  ctx.save();
  path();
  ctx.clip();
  // ground occlusion
  ctx.fillStyle = linear(ctx, 0, y + h * 0.2, 0, y + h * 0.5, [[0, 'rgba(0,0,0,0)'], [1, ao]]);
  ctx.fillRect(x - w, y - h, w * 2, h * 2);
  // inner rim light hugging the silhouette
  ctx.lineWidth = Math.min(w, h) * 0.09;
  ctx.strokeStyle = linear(ctx, x - w * 0.5, y - h * 0.5, x + w * 0.35, y + h * 0.3, [[0, rim], [0.55, 'rgba(255,255,255,0)']]);
  path();
  ctx.stroke();
  // warm bounce light from the floor on the lower edge
  ctx.lineWidth = Math.min(w, h) * 0.05;
  ctx.strokeStyle = linear(ctx, 0, y + h * 0.25, 0, y + h * 0.5, [[0, 'rgba(255,220,200,0)'], [1, 'rgba(255,220,200,0.35)']]);
  path();
  ctx.stroke();
  ctx.restore();
}

/** Inner shadow for recessed panels (face windows, visors). Light from above. */
export function recess(ctx, path, { shadow = 'rgba(150,60,50,0.35)', depth = 0.03, box }) {
  ctx.save();
  path();
  ctx.clip();
  ctx.lineWidth = depth * 2.2;
  ctx.strokeStyle = shadow;
  ctx.translate(0, depth * 0.7);
  path();
  ctx.stroke();
  ctx.translate(0, -depth * 0.7);
  ctx.fillStyle = linear(ctx, 0, box.y - box.h / 2, 0, box.y, [[0, shadow], [1, 'rgba(0,0,0,0)']]);
  ctx.globalAlpha = 0.5;
  ctx.fillRect(box.x - box.w, box.y - box.h, box.w * 2, box.h);
  ctx.restore();
}

/** Cheap smooth 1-D noise (sum of sines) for flicker and drift. */
export const wave = (t, seed = 0) =>
  Math.sin(t * 1.7 + seed) * 0.5 + Math.sin(t * 2.9 + seed * 2.1) * 0.3 + Math.sin(t * 5.3 + seed * 0.7) * 0.2;
