// A 2D canvas stand-in for the WebGL PartBuilder: same methods (blob, ellipse, rrect,
// capsule, balls, ring, poly, glow + the transform stack), painted with soft gradients.
// Lets a species describe its body once in gl() and still get the Classic look:
//   draw(ctx, pose, s) { this.gl(new Painter2D(ctx), pose, s); this.drawFace(ctx, pose, s); }

import { blobPath, roundRectPath, roundPolyPath } from './shapes.js';
import { shade, withAlpha } from './face.js';
import { MATERIALS } from '../gl/parts.js';

const TAU = Math.PI * 2;
const GLOSSY = new Set(['vinyl', 'jelly', 'glass']);

export class Painter2D {
  constructor(ctx) { this.ctx = ctx; }

  save() { this.ctx.save(); }
  restore() { this.ctx.restore(); }
  translate(x, y) { this.ctx.translate(x, y); }
  rotate(a) { if (a) this.ctx.rotate(a); }
  scale(x, y = x) { this.ctx.scale(x, y); }

  blob({ x = 0, y = 0, w, h, nTop = 2.3, nBottom = 3, flare = 0, top = 1 }, m) {
    blobPath(this.ctx, x, y, w, h, { nTop, nBottom, flare, top });
    this.fill(m, x, y, w / 2, h / 2);
  }

  ellipse({ x = 0, y = 0, rx, ry }, m) {
    this.ctx.beginPath();
    this.ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    this.fill(m, x, y, rx, ry);
  }

  rrect({ x = 0, y = 0, w, h, r }, m) {
    roundRectPath(this.ctx, x - w / 2, y - h / 2, w, h, Math.min(r, w / 2, h / 2));
    this.fill(m, x, y, w / 2, h / 2);
  }

  capsule({ ax, ay, bx, by, r }, m) {
    const a = Math.atan2(by - ay, bx - ax);
    const c = this.ctx;
    c.beginPath();
    c.arc(ax, ay, r, a + Math.PI / 2, a + Math.PI * 1.5);
    c.arc(bx, by, r, a - Math.PI / 2, a + Math.PI / 2);
    c.closePath();
    this.fill(m, (ax + bx) / 2, (ay + by) / 2, Math.abs(bx - ax) / 2 + r, Math.abs(by - ay) / 2 + r);
  }

  balls(list, k, m) {
    const c = this.ctx;
    c.beginPath();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const b of list) {
      const r = b.r + k * 0.12; // a little fatter: stands in for the smooth blend
      c.moveTo(b.x + r, b.y);
      c.arc(b.x, b.y, r, 0, TAU);
      x0 = Math.min(x0, b.x - r); y0 = Math.min(y0, b.y - r); x1 = Math.max(x1, b.x + r); y1 = Math.max(y1, b.y + r);
    }
    this.fill(m, (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2, 'nonzero');
  }

  ring({ x = 0, y = 0, rx, ry, w, half = 0 }, m) {
    const c = this.ctx;
    const mat = resolve(m);
    c.save();
    c.beginPath();
    if (half === 0) c.ellipse(x, y, rx, ry, 0, 0, TAU);
    else c.ellipse(x, y, rx, ry, 0, half < 0 ? Math.PI : 0, half < 0 ? TAU : Math.PI);
    c.lineWidth = w * 2;
    c.lineCap = 'round';
    c.globalAlpha *= mat.alpha ?? 1;
    c.strokeStyle = mat.color ?? '#ccc';
    c.stroke();
    c.restore();
  }

  poly(points, r, m) {
    roundPolyPath(this.ctx, points, r);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of points) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    this.fill(m, (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2);
  }

  glow({ x = 0, y = 0, r, color, strength = 0.5 }) {
    const c = this.ctx;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, withAlpha(color, strength * 0.6));
    g.addColorStop(1, withAlpha(color, 0));
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }

  shadow() { /* the classic renderer draws its own floor shadow */ }

  /** Fills the current path with a top-left-lit gradient, plus a gloss spot for shiny materials. */
  fill(m, cx, cy, hx, hy, rule = 'nonzero') {
    const c = this.ctx;
    const mat = resolve(m);
    const base = mat.color ?? '#dddddd';
    const dark = mat.color2 ?? shade(base, -0.2);
    const r = Math.max(hx, hy) * 1.5;
    const g = c.createRadialGradient(cx - hx * 0.35, cy - hy * 0.45, 0, cx - hx * 0.15, cy - hy * 0.2, r);
    g.addColorStop(0, shade(base, 0.3));
    g.addColorStop(0.45, base);
    g.addColorStop(1, dark);
    c.save();
    c.globalAlpha *= mat.alpha ?? 1;
    c.fillStyle = g;
    c.fill(rule);
    if (GLOSSY.has(mat.base) && hx > 0.04) {
      c.clip(rule);
      c.fillStyle = 'rgba(255,255,255,0.45)';
      c.beginPath();
      c.ellipse(cx - hx * 0.38, cy - hy * 0.5, hx * 0.28, hy * 0.14, -0.5, 0, TAU);
      c.fill();
    }
    c.restore();
  }
}

function resolve(m) {
  if (typeof m === 'string') return { base: m, ...MATERIALS[m] };
  return { ...(MATERIALS[m?.base] ?? {}), ...m };
}
