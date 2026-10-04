// Wardrobe drawing: hats (head slot) and glasses (face slot), in the pet's local space
// so they squash, lean and hop with it. Hats sit where the species says
// (`propFit.hat`: x, y, s = scale, rot), else on top of the hit area. A little
// follow-through tilt makes them feel like they're actually perched on the head.

import { shade, withAlpha } from './face.js';

const TAU = Math.PI * 2;

export function hatAnchor(species) {
  const h = species.hit;
  return { x: 0, y: h.cy - h.ry + 0.06, s: 1, rot: 0, ...(species.propFit?.hat ?? {}) };
}

/** @param {{head: string|null, face: string|null}} outfit */
export function drawOutfit(ctx, species, pose, outfit) {
  if (!outfit) return;
  if (outfit.face) drawGlasses(ctx, species, pose, outfit.face);
  if (outfit.head) drawHat(ctx, species, pose, outfit.head);
}

function drawHat(ctx, species, pose, id) {
  const a = hatAnchor(species);
  const lag = -(pose.lean?.x ?? 0) * 0.07 + Math.sin(pose.t * 17) * (pose.hop ?? 0) * 0.3;
  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.rotate(a.rot + lag);
  ctx.scale(a.s, a.s);
  const draw = HATS[id];
  draw?.(ctx, pose, species.palette.accent);
  ctx.restore();
}

// ---------------------------------------------------------------- hats (origin = where it sits)
const HATS = {
  bow(ctx, pose, accent) {
    ctx.translate(0.2, 0.02);
    ctx.rotate(0.28);
    const c = '#FF6F91';
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.scale(side, 1);
      const g = ctx.createLinearGradient(0, -0.07, 0.13, 0.07);
      g.addColorStop(0, shade(c, 0.25));
      g.addColorStop(1, shade(c, -0.18));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0.015, 0);
      ctx.bezierCurveTo(0.05, -0.1, 0.15, -0.09, 0.14, -0.01);
      ctx.bezierCurveTo(0.15, 0.08, 0.05, 0.09, 0.015, 0);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.ellipse(0.08, -0.045, 0.03, 0.012, -0.3, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = shade(c, -0.1);
    roundRect(ctx, -0.028, -0.032, 0.056, 0.064, 0.02);
    ctx.fill();
  },

  flower(ctx, pose) {
    ctx.translate(0.21, 0.03);
    ctx.rotate(pose.t * 0.25);
    for (let i = 0; i < 7; i++) {
      ctx.save();
      ctx.rotate((i / 7) * TAU);
      const g = ctx.createLinearGradient(0, 0, 0, -0.1);
      g.addColorStop(0, '#FF8FB1');
      g.addColorStop(1, '#FFD6E4');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(0, -0.055, 0.026, 0.05, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    const c = ctx.createRadialGradient(-0.01, -0.012, 0, 0, 0, 0.034);
    c.addColorStop(0, '#FFE680');
    c.addColorStop(1, '#F2B321');
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(0, 0, 0.032, 0, TAU); ctx.fill();
  },

  party(ctx, pose) {
    const accent = '#3FBFAE'; // fixed teal: stands out on every pet's colours
    ctx.rotate(-0.16);
    const w = 0.15, hgt = 0.34;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-w, 0); ctx.lineTo(0, -hgt); ctx.lineTo(w, 0);
    ctx.quadraticCurveTo(0, 0.035, -w, 0);
    ctx.closePath();
    const g = ctx.createLinearGradient(-w, 0, w, 0);
    g.addColorStop(0, shade(accent, 0.3));
    g.addColorStop(0.6, accent);
    g.addColorStop(1, shade(accent, -0.25));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 0.03;
    for (let i = 0; i < 4; i++) {
      const y = -0.05 - i * 0.08;
      ctx.beginPath(); ctx.moveTo(-w, y + 0.04); ctx.lineTo(w, y - 0.04); ctx.stroke();
    }
    ctx.restore();
    pompom(ctx, 0, -hgt, 0.045, '#FFE27A');
  },

  beanie(ctx, pose) {
    const c = '#5B8DEF';
    const w = 0.27;
    ctx.translate(0, 0.02);
    const g = ctx.createLinearGradient(0, -0.22, 0, 0);
    g.addColorStop(0, shade(c, 0.2));
    g.addColorStop(1, shade(c, -0.15));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-w, 0);
    ctx.bezierCurveTo(-w, -0.25, w, -0.25, w, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,40,90,0.18)';
    ctx.lineWidth = 0.01;
    for (let x = -0.16; x <= 0.17; x += 0.08) {
      ctx.beginPath(); ctx.moveTo(x, -0.01); ctx.quadraticCurveTo(x * 0.6, -0.12, x * 0.3, -0.17); ctx.stroke();
    }
    // ribbed cuff
    ctx.fillStyle = shade(c, -0.08);
    roundRect(ctx, -w - 0.015, -0.035, (w + 0.015) * 2, 0.075, 0.035);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    for (let x = -w + 0.02; x < w; x += 0.035) {
      ctx.beginPath(); ctx.moveTo(x, -0.025); ctx.lineTo(x, 0.03); ctx.stroke();
    }
    pompom(ctx, 0, -0.19, 0.06, '#F4F1EC');
  },

  crown(ctx, pose) {
    const w = 0.2, hgt = 0.15;
    const g = ctx.createLinearGradient(0, -hgt, 0, 0.02);
    g.addColorStop(0, '#FFE58A');
    g.addColorStop(0.55, '#F5C33B');
    g.addColorStop(1, '#C98B12');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-w, 0.02);
    ctx.lineTo(-w, -hgt * 0.55);
    ctx.lineTo(-w * 0.5, -hgt * 0.15);
    ctx.lineTo(0, -hgt);
    ctx.lineTo(w * 0.5, -hgt * 0.15);
    ctx.lineTo(w, -hgt * 0.55);
    ctx.lineTo(w, 0.02);
    ctx.quadraticCurveTo(0, 0.05, -w, 0.02);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,90,0,0.35)';
    ctx.lineWidth = 0.008;
    ctx.stroke();
    for (const [x, col] of [[-w * 0.55, '#57C4F2'], [0, '#F2546B'], [w * 0.55, '#57C4F2']]) {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(x, -0.025, 0.022, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath(); ctx.arc(x - 0.007, -0.032, 0.007, 0, TAU); ctx.fill();
    }
    for (const [x, y] of [[-w, -hgt * 0.55], [0, -hgt], [w, -hgt * 0.55]]) {
      ctx.fillStyle = '#FFF4C2';
      ctx.beginPath(); ctx.arc(x, y, 0.016, 0, TAU); ctx.fill();
    }
    const glint = (Math.sin(pose.t * 1.7) + 1) / 2;
    ctx.fillStyle = `rgba(255,255,255,${0.25 + glint * 0.35})`;
    ctx.beginPath(); ctx.ellipse(-w * 0.62, -0.06, 0.012, 0.035, 0.3, 0, TAU); ctx.fill();
  },

  wizard(ctx, pose) {
    const c = '#4B3C9E';
    // brim
    ctx.fillStyle = shade(c, -0.2);
    ctx.beginPath(); ctx.ellipse(0, 0, 0.3, 0.06, 0, 0, TAU); ctx.fill();
    // floppy cone
    const flop = Math.sin(pose.t * 1.3) * 0.02;
    const g = ctx.createLinearGradient(-0.17, 0, 0.17, 0);
    g.addColorStop(0, shade(c, 0.25));
    g.addColorStop(1, shade(c, -0.15));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-0.17, -0.01);
    ctx.bezierCurveTo(-0.12, -0.2, -0.05, -0.33, 0.06, -0.42);
    ctx.quadraticCurveTo(0.2 + flop, -0.44, 0.24 + flop, -0.36);
    ctx.quadraticCurveTo(0.12, -0.33, 0.1, -0.24);
    ctx.bezierCurveTo(0.12, -0.15, 0.15, -0.06, 0.17, -0.01);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#F7C948';
    ctx.fillRect(-0.168, -0.055, 0.336, 0.045);
    for (const [x, y, r] of [[-0.06, -0.15, 0.025], [0.05, -0.27, 0.018], [0.0, -0.1, 0.012]]) star(ctx, x, y, r);
  },
};

function pompom(ctx, x, y, r, color) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, 0, x, y, r);
  g.addColorStop(0, shade(color, 0.25));
  g.addColorStop(1, shade(color, -0.12));
  ctx.fillStyle = g;
  ctx.beginPath();
  for (let i = 0; i <= 18; i++) {
    const a = (i / 18) * TAU;
    const rr = r * (i % 2 ? 0.86 : 1);
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.fill();
}

function star(ctx, x, y, r) {
  ctx.fillStyle = '#FFE48A';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.fill();
}

// ---------------------------------------------------------------- glasses
function drawGlasses(ctx, species, pose, id) {
  const f = species.face;
  const r = f.r * 1.45;
  const dx = (pose.lean?.x ?? 0) * 0.045, dy = (pose.lean?.y ?? 0) * 0.03;
  const dark = id === 'shades';
  ctx.save();
  ctx.translate(dx, dy + (species.propFit?.glassesY ?? 0));
  const frame = dark ? '#1E1A22' : '#6B4B3A';
  ctx.lineWidth = dark ? 0.02 : 0.013;
  ctx.strokeStyle = frame;
  for (const x of [f.lx, f.rx]) {
    ctx.beginPath();
    if (dark) roundRectPath(ctx, x - r * 1.05, f.y - r * 0.8, r * 2.1, r * 1.6, r * 0.55);
    else ctx.arc(x, f.y, r, 0, TAU);
    if (dark) {
      const g = ctx.createLinearGradient(0, f.y - r, 0, f.y + r);
      g.addColorStop(0, '#3A3044');
      g.addColorStop(1, '#0E0A12');
      ctx.fillStyle = g;
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(200,230,255,0.16)';
      ctx.fill();
    }
    ctx.stroke();
    // glint
    ctx.save();
    ctx.clip();
    ctx.fillStyle = withAlpha('#FFFFFF', dark ? 0.32 : 0.45);
    ctx.beginPath();
    ctx.moveTo(x - r * 0.9, f.y - r * 0.1);
    ctx.lineTo(x - r * 0.3, f.y - r * 0.95);
    ctx.lineTo(x - r * 0.05, f.y - r * 0.95);
    ctx.lineTo(x - r * 0.65, f.y + r * 0.1);
    ctx.fill();
    ctx.restore();
  }
  // bridge + arms
  ctx.beginPath();
  ctx.moveTo(f.lx + r * (dark ? 1.05 : 1), f.y - r * 0.2);
  ctx.quadraticCurveTo(0, f.y - r * 0.55, f.rx - r * (dark ? 1.05 : 1), f.y - r * 0.2);
  ctx.stroke();
  ctx.restore();
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  roundRectPath(ctx, x, y, w, h, r);
}

// ---------------------------------------------------------------- picker icons
const ICON_FIT = {
  bow: { s: 2.2, x: -0.2, y: 0.0 }, flower: { s: 2.4, x: -0.21, y: -0.03 },
  party: { s: 1.45, x: 0, y: 0.17 }, beanie: { s: 1.5, x: 0, y: 0.1 },
  crown: { s: 1.9, x: 0, y: 0.07 }, wizard: { s: 1.35, x: -0.03, y: 0.2 },
};
const ICON_FACE = { lx: -0.17, rx: 0.17, y: 0, r: 0.1 };
const STILL = { t: 1.2, hop: 0, lean: { x: 0, y: 0 } };

/** Draws one wardrobe item centred in a square canvas of `px` device pixels. */
export function drawItemIcon(ctx, id, px, accent = '#F2735F') {
  ctx.setTransform(px, 0, 0, px, 0, 0);
  ctx.clearRect(0, 0, 1, 1);
  ctx.translate(0.5, 0.5);
  if (HATS[id]) {
    const f = ICON_FIT[id] ?? { s: 1.5, x: 0, y: 0 };
    ctx.scale(f.s, f.s);
    ctx.translate(f.x, f.y);
    HATS[id](ctx, STILL, accent);
  } else {
    ctx.scale(1.5, 1.5);
    drawGlasses(ctx, { face: ICON_FACE }, STILL, id);
  }
}
