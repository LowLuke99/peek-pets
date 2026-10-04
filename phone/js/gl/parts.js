// Scene description for the WebGL "clay" renderer. Species describe their bodies as
// parts (blob, ellipse, rounded rect, capsule, metaballs, ring) with a material, using
// a canvas-like transform stack. The GL stage turns each part into one lit quad.
// Pure JS (no GL) so it can be unit tested.

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- 2D affine [a b c d e f]
// Maps (x, y) → (a*x + c*y + e, b*x + d*y + f), like CanvasRenderingContext2D.setTransform.
export const IDENTITY = Object.freeze([1, 0, 0, 1, 0, 0]);

export function multiply(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export const translation = (x, y) => [1, 0, 0, 1, x, y];
export const rotation = (a) => [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
export const scaling = (x, y = x) => [x, 0, 0, y, 0, 0];

export function apply(m, x, y) {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

/** Pixels per local unit (geometric mean of the axis scales). */
export function scaleOf(m) {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
}

/**
 * Transforms local-space gradients to screen space, scale removed: k · (M⁻¹)ᵀ as a
 * column-major mat2 (what WebGL's uniformMatrix2fv wants).
 */
export function normalMatrix(m) {
  const det = m[0] * m[3] - m[1] * m[2] || 1e-9;
  const k = Math.sqrt(Math.abs(det));
  // inverse = [d -c; -b a] / det ; transpose → [d -b; -c a] / det (row-major)
  return [m[3] * k / det, -m[2] * k / det, -m[1] * k / det, m[0] * k / det];
}

// ---------------------------------------------------------------- colours
const linearCache = new Map();
/** '#RRGGBB' → linear-light [r, g, b] in 0..1 (lighting happens in linear space). */
export function linear(hex) {
  let v = linearCache.get(hex);
  if (v) return v;
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const toLin = (c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  v = [toLin((n >> 16) & 255), toLin((n >> 8) & 255), toLin(n & 255)];
  linearCache.set(hex, v);
  return v;
}

// ---------------------------------------------------------------- materials
// wrap: soft diffuse wrap · spec/shine: highlight · rim · sss: subsurface glow amount
// ao: ground occlusion · grain · emissive · alpha · mode: dome|bevel|inset|flat
// depth: dome height (local units) · bevel: rounded-edge width · grad: top→bottom tint
export const MATERIALS = Object.freeze({
  clay: { wrap: 0.5, spec: 0.24, shine: 26, rim: 0.42, sss: 0.65, ao: 0.2, grain: 0.035, emissive: 0, alpha: 1, mode: 'dome', depth: 0.42, bevel: 0.12, grad: 0.55 },
  vinyl: { wrap: 0.3, spec: 0.55, shine: 70, rim: 0.5, sss: 0.25, ao: 0.28, grain: 0.015, emissive: 0, alpha: 1, mode: 'dome', depth: 0.38, bevel: 0.1, grad: 0.35 },
  plate: { wrap: 0.5, spec: 0.12, shine: 18, rim: 0.0, sss: 0.3, ao: 0.08, grain: 0.03, emissive: 0, alpha: 1, mode: 'inset', depth: 0.06, bevel: 0.035, grad: 0.3 },
  jelly: { wrap: 0.7, spec: 0.75, shine: 90, rim: 0.85, sss: 1.0, ao: 0.12, grain: 0.0, emissive: 0.2, alpha: 0.92, mode: 'dome', depth: 0.45, bevel: 0.12, grad: 0.6 },
  glass: { wrap: 0.4, spec: 0.9, shine: 120, rim: 0.7, sss: 0.4, ao: 0.1, grain: 0.0, emissive: 0.05, alpha: 1, mode: 'dome', depth: 0.4, bevel: 0.1, grad: 0.45 },
  flame: { wrap: 0.9, spec: 0.1, shine: 12, rim: 0.6, sss: 1.0, ao: 0.0, grain: 0.0, emissive: 0.85, alpha: 0.96, mode: 'dome', depth: 0.3, bevel: 0.1, grad: 0.9 },
  cloud: { wrap: 0.85, spec: 0.08, shine: 10, rim: 0.55, sss: 0.7, ao: 0.18, grain: 0.02, emissive: 0.05, alpha: 1, mode: 'bevel', depth: 0.3, bevel: 0.11, grad: 0.35 },
  fluff: { wrap: 0.65, spec: 0.1, shine: 14, rim: 0.5, sss: 0.6, ao: 0.25, grain: 0.05, emissive: 0, alpha: 1, mode: 'dome', depth: 0.4, bevel: 0.1, grad: 0.4 },
  metal: { wrap: 0.2, spec: 0.8, shine: 60, rim: 0.4, sss: 0.0, ao: 0.3, grain: 0.01, emissive: 0, alpha: 1, mode: 'bevel', depth: 0.2, bevel: 0.03, grad: 0.4 },
  flat: { wrap: 0.5, spec: 0.0, shine: 10, rim: 0.0, sss: 0.0, ao: 0.0, grain: 0.0, emissive: 0, alpha: 1, mode: 'flat', depth: 0, bevel: 0.01, grad: 0 },
  pedestal: { wrap: 0.6, spec: 0.1, shine: 20, rim: 0.15, sss: 0.2, ao: 0.08, grain: 0.02, emissive: 0, alpha: 0.75, mode: 'bevel', depth: 0.05, bevel: 0.05, grad: 0.4 },
});

export const SHAPES = Object.freeze({ blob: 0, ellipse: 1, rrect: 2, capsule: 3, balls: 4, ring: 5, poly: 6 });
export const MAX_POLY = 6;
export const MODES = Object.freeze({ dome: 0, bevel: 1, inset: 2, flat: 3, shadow: 4, glow: 5 });
export const MAX_BALLS = 8;

/**
 * Collects parts with a canvas-like transform stack. `base` maps stage units to
 * device pixels; species then translate/rotate/scale just like their 2D draw code.
 */
export class PartBuilder {
  constructor() {
    this.parts = [];
    this.m = IDENTITY;
    this.stack = [];
  }

  reset(base) {
    this.parts = [];
    this.m = base;
    this.stack = [];
    return this;
  }

  save() { this.stack.push(this.m); }
  restore() { this.m = this.stack.pop() ?? this.m; }
  translate(x, y) { this.m = multiply(this.m, translation(x, y)); }
  rotate(a) { if (a) this.m = multiply(this.m, rotation(a)); }
  scale(x, y = x) { this.m = multiply(this.m, scaling(x, y)); }

  /** Superellipse body (same parameters as shapes.blobPath). */
  blob({ x = 0, y = 0, w, h, nTop = 2.3, nBottom = 3, flare = 0, top = 1 }, material, opts) {
    const hx = (w / 2) * (1 + Math.abs(flare)), hy = h / 2;
    return this.push('blob', [x, y, w / 2, h / 2, nTop, nBottom, flare, top], { cx: x, cy: y, hx, hy }, material, opts);
  }

  ellipse({ x = 0, y = 0, rx, ry }, material, opts) {
    return this.push('ellipse', [x, y, rx, ry], { cx: x, cy: y, hx: rx, hy: ry }, material, opts);
  }

  rrect({ x = 0, y = 0, w, h, r }, material, opts) {
    return this.push('rrect', [x, y, w / 2, h / 2, Math.min(r, w / 2, h / 2)], { cx: x, cy: y, hx: w / 2, hy: h / 2 }, material, opts);
  }

  capsule({ ax, ay, bx, by, r }, material, opts) {
    return this.push('capsule', [ax, ay, bx, by, r],
      { cx: (ax + bx) / 2, cy: (ay + by) / 2, hx: Math.abs(bx - ax) / 2 + r, hy: Math.abs(by - ay) / 2 + r }, material, opts);
  }

  /** Smooth union of up to 8 circles ({x, y, r}); k = blend radius. */
  balls(list, k, material, opts) {
    const circles = list.slice(0, MAX_BALLS);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of circles) { x0 = Math.min(x0, c.x - c.r); y0 = Math.min(y0, c.y - c.r); x1 = Math.max(x1, c.x + c.r); y1 = Math.max(y1, c.y + c.r); }
    const pad = k * 0.5;
    return this.push('balls', [k, circles.length], { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, hx: (x1 - x0) / 2 + pad, hy: (y1 - y0) / 2 + pad }, material, { ...opts, circles });
  }

  /** Elliptical ring of tube width w; half: 0 = all, -1 = back (upper) half, 1 = front (lower) half. */
  ring({ x = 0, y = 0, rx, ry, w, half = 0 }, material, opts) {
    return this.push('ring', [x, y, rx, ry, w, half], { cx: x, cy: y, hx: rx + w, hy: ry + w }, material, opts);
  }

  /**
   * Rounded polygon (≤ 6 points, like shapes.roundPolyPath). The corners are pulled in
   * by the rounding radius so the outline stays about the same size.
   */
  poly(points, r, material, opts) {
    const pts = points.slice(0, MAX_POLY);
    const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length, cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    const inner = pts.map((p) => {
      const dx = p.x - cx, dy = p.y - cy, len = Math.hypot(dx, dy) || 1;
      const k = Math.max(0, len - r * 0.6) / len;
      return { x: cx + dx * k, y: cy + dy * k };
    });
    const params = Array(16).fill(0);
    inner.forEach((p, i) => { params[i * 2] = p.x; params[i * 2 + 1] = p.y; });
    params[12] = inner.length;
    params[13] = r * 0.6;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    return this.push('poly', params, { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, hx: (x1 - x0) / 2, hy: (y1 - y0) / 2 }, material, opts);
  }

  /** Soft contact shadow on the floor (gaussian). */
  shadow({ x = 0, y = 0, rx, ry, strength = 0.3, color = '#6E2820' }) {
    return this.push('ellipse', [x, y, rx, ry], { cx: x, cy: y, hx: rx * 1.6, hy: ry * 1.6 }, { mode: 'shadow', color, alpha: strength });
  }

  /** Additive light bloom around glowing pets. */
  glow({ x = 0, y = 0, r, color, strength = 0.5 }) {
    return this.push('ellipse', [x, y, r, r], { cx: x, cy: y, hx: r, hy: r }, { mode: 'glow', color, alpha: strength });
  }

  push(shape, params, box, material, opts = {}) {
    const mat = typeof material === 'string' ? { ...MATERIALS[material] } : { ...(MATERIALS[material?.base] ?? {}), ...material };
    const margin = 2 / Math.max(1e-6, scaleOf(this.m)); // ≥ 2 px for anti-aliasing
    const part = {
      shape: SHAPES[shape],
      mode: MODES[mat.mode ?? 'dome'],
      params: params.concat(Array(16).fill(0)).slice(0, 16),
      circles: opts.circles ?? null,
      box: { cx: box.cx, cy: box.cy, hx: box.hx + margin, hy: box.hy + margin },
      m: this.m,
      mat,
    };
    this.parts.push(part);
    return part;
  }
}

/** Quick bounds check used by tests and culling: does a part's box land on screen? */
export function partOnScreen(part, w, h) {
  const { cx, cy, hx, hy } = part.box;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const p = apply(part.m, cx + sx * hx, cy + sy * hy);
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  return x1 >= 0 && y1 >= 0 && x0 <= w && y0 <= h;
}

export { TAU };
