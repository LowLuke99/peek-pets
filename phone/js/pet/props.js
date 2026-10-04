// Props the helpful powers give the pet: a desk + book for focus, headphones for
// music, a kitchen timer, an hourglass while waiting, a bandage when the PC is
// poorly, a glass of water, and little mittens for waving/pointing/stretching.
// Body props are drawn in the pet's local space (they squash and lean with it);
// world props sit on the floor. All sizes are in pet units (body ≈ 1 wide).

import { clamp, lerp, smoothstep } from '../core/spring.js';
import { shade, withAlpha } from './face.js';

const TAU = Math.PI * 2;

/** Where props attach on this species (derived from its hit area unless it says otherwise). */
function fit(species) {
  const h = species.hit;
  return {
    top: species.propFit?.top ?? h.cy - h.ry,
    side: species.propFit?.side ?? h.rx,
    faceY: species.face.y,
    cy: h.cy,
    bottom: h.cy + h.ry,
    mitten: species.propFit?.mitten ?? species.palette.accent,
    headphones: species.propFit?.headphones !== false,
  };
}

// ---------------------------------------------------------------- body (local space)
export function drawBodyProps(ctx, species, pose, cues, info = {}) {
  const f = fit(species);
  if (cues.head === 'bandage') bandage(ctx, f.side * 0.42, f.top + 0.1);
  if (cues.head === 'headphones' && f.headphones) headphones(ctx, f, pose, species.palette.accent);
  if (cues.hand === 'timer') kitchenTimer(ctx, f.side + 0.1, f.cy + 0.12, pose, info.timerProgress ?? 0, info.alarm);
  if (info.water) waterGlass(ctx, -f.side - 0.08, f.cy + 0.1, pose);
  if (pose.reach > 0.01) stretchMittens(ctx, f, pose);
  if (pose.wave > 0.01) waveMitten(ctx, f, pose);
  if (pose.point > 0.01) pointMitten(ctx, f, pose);
}

// ---------------------------------------------------------------- world (floor)
export function drawWorldProps(ctx, species, pose, cues, info = {}) {
  if (cues.hand === 'hourglass') hourglass(ctx, pose.x * 0.4 + 0.74, 0, pose.t);
  if (cues.hand === 'book') desk(ctx, pose.x * 0.3, pose.t, info.focusProgress ?? 0);
}

/** Props behind the pet (drawn before it). */
export function drawBackProps(ctx, species, pose, cues) {
  if (cues.head === 'headphones' && fit(species).headphones) headband(ctx, fit(species), species.palette.accent);
}

// ---------------------------------------------------------------- pieces
function headband(ctx, f, accent) {
  const w = f.side * 0.98;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#3B2F33';
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.moveTo(-w, f.faceY + 0.02);
  ctx.bezierCurveTo(-w, f.top - 0.12, w, f.top - 0.12, w, f.faceY + 0.02);
  ctx.stroke();
  ctx.strokeStyle = withAlpha(accent, 0.9);
  ctx.lineWidth = 0.016;
  ctx.stroke(); // a coloured stripe along the same band
  ctx.restore();
}

function headphones(ctx, f, pose, accent) {
  for (const side of [-1, 1]) {
    const x = side * (f.side + 0.005), y = f.faceY + 0.03;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(side * 0.08 + (pose.bop ? Math.sin(pose.t * 10.5) * 0.04 : 0));
    const g = ctx.createLinearGradient(-0.06, -0.1, 0.06, 0.1);
    g.addColorStop(0, '#5A4A50');
    g.addColorStop(1, '#2B2226');
    ctx.fillStyle = g;
    roundRect(ctx, -0.058, -0.1, 0.116, 0.2, 0.05);
    ctx.fill();
    const c = ctx.createRadialGradient(-side * 0.01, -0.02, 0, 0, 0, 0.07);
    c.addColorStop(0, shade(accent, 0.35));
    c.addColorStop(1, accent);
    ctx.fillStyle = c;
    roundRect(ctx, -0.04, -0.075, 0.08, 0.15, 0.035);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.ellipse(-0.012, -0.045, 0.012, 0.03, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

function bandage(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  for (const rot of [0.6, -0.6]) {
    ctx.save();
    ctx.rotate(rot);
    ctx.fillStyle = '#F6D7B8';
    roundRect(ctx, -0.085, -0.024, 0.17, 0.048, 0.024);
    ctx.fill();
    ctx.strokeStyle = 'rgba(160,110,80,0.35)';
    ctx.lineWidth = 0.005;
    ctx.stroke();
    ctx.fillStyle = '#EBC29C';
    roundRect(ctx, -0.028, -0.02, 0.056, 0.04, 0.01);
    ctx.fill();
    ctx.fillStyle = 'rgba(160,110,80,0.4)';
    for (const dx of [-0.012, 0, 0.012]) for (const dy of [-0.008, 0.008]) { ctx.beginPath(); ctx.arc(dx, dy, 0.0025, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  ctx.restore();
}

function kitchenTimer(ctx, x, y, pose, progress, alarm) {
  const r = 0.085;
  const wob = alarm ? Math.sin(pose.t * 40) * 0.18 : Math.sin(pose.t * 2) * 0.05;
  ctx.save();
  ctx.translate(x, y + Math.sin(pose.t * 2.2) * 0.008);
  ctx.rotate(wob);
  // body
  const g = ctx.createRadialGradient(-r * 0.4, -r * 0.4, 0, 0, 0, r * 1.2);
  g.addColorStop(0, '#FF9C88');
  g.addColorStop(1, '#D9493F');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  // knob
  ctx.fillStyle = '#7B3B2E';
  roundRect(ctx, -0.016, -r - 0.028, 0.032, 0.03, 0.01);
  ctx.fill();
  // dial
  ctx.fillStyle = '#FFF8F2';
  ctx.beginPath(); ctx.arc(0, 0.006, r * 0.68, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(120,60,50,0.45)';
  ctx.lineWidth = 0.004;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.55, 0.006 + Math.sin(a) * r * 0.55);
    ctx.lineTo(Math.cos(a) * r * 0.62, 0.006 + Math.sin(a) * r * 0.62);
    ctx.stroke();
  }
  // remaining wedge + hand
  const left = 1 - clamp(progress, 0, 1);
  ctx.fillStyle = 'rgba(242,115,95,0.35)';
  ctx.beginPath();
  ctx.moveTo(0, 0.006);
  ctx.arc(0, 0.006, r * 0.5, -Math.PI / 2, -Math.PI / 2 + left * TAU);
  ctx.closePath();
  ctx.fill();
  const a = -Math.PI / 2 + left * TAU;
  ctx.strokeStyle = '#3B2A26';
  ctx.lineWidth = 0.008;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0.006); ctx.lineTo(Math.cos(a) * r * 0.5, 0.006 + Math.sin(a) * r * 0.5); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath(); ctx.ellipse(-r * 0.45, -r * 0.5, r * 0.18, r * 0.1, -0.6, 0, TAU); ctx.fill();
  if (alarm) {
    ctx.strokeStyle = '#F2735F';
    ctx.lineWidth = 0.01;
    for (const s of [-1, 1]) for (const k of [0, 1]) {
      const d = r * (1.35 + k * 0.3);
      ctx.beginPath(); ctx.arc(0, 0, d, -Math.PI / 2 + s * 0.35 - 0.25, -Math.PI / 2 + s * 0.35 + 0.25); ctx.stroke();
    }
  }
  ctx.restore();
}

function waterGlass(ctx, x, y, pose) {
  ctx.save();
  ctx.translate(x, y + Math.sin(pose.t * 2) * 0.006);
  ctx.rotate(-0.08);
  const w = 0.07, h = 0.13;
  ctx.fillStyle = 'rgba(124,196,245,0.55)';
  ctx.beginPath();
  ctx.moveTo(-w * 0.45, -h * 0.15 + Math.sin(pose.t * 3) * 0.003);
  ctx.lineTo(w * 0.45, -h * 0.15 - Math.sin(pose.t * 3) * 0.003);
  ctx.lineTo(w * 0.4, h / 2);
  ctx.lineTo(-w * 0.4, h / 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 0.008;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(-w * 0.4, h / 2); ctx.lineTo(w * 0.4, h / 2); ctx.lineTo(w / 2, -h / 2);
  ctx.stroke();
  ctx.strokeStyle = '#F2735F';
  ctx.lineWidth = 0.009;
  ctx.beginPath(); ctx.moveTo(0.008, h * 0.3); ctx.lineTo(0.02, -h * 0.62); ctx.lineTo(0.045, -h * 0.7); ctx.stroke();
  ctx.restore();
}

function mitten(ctx, x, y, rot, color, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(scale, scale);
  const g = ctx.createRadialGradient(-0.012, -0.018, 0, 0, 0, 0.06);
  g.addColorStop(0, shade(color, 0.3));
  g.addColorStop(1, shade(color, -0.08));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, 0, 0.042, 0.05, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-0.035, 0.012, 0.016, 0.022, -0.5, 0, TAU); ctx.fill(); // thumb
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.ellipse(-0.012, -0.022, 0.014, 0.009, -0.5, 0, TAU); ctx.fill();
  ctx.restore();
}

function waveMitten(ctx, f, pose) {
  const k = smoothstep(0, 1, pose.wave);
  const x = f.side + 0.03, y = lerp(f.cy + 0.1, f.faceY - 0.08, k);
  mitten(ctx, x, y, 0.5 + Math.sin(pose.t * 12) * 0.55 * k, f.mitten, 0.6 + 0.4 * k);
}

function pointMitten(ctx, f, pose) {
  const k = smoothstep(0, 1, pose.point);
  const gx = pose.gaze.x, gy = pose.gaze.y;
  const len = Math.hypot(gx, gy) || 1;
  const dx = gx / len, dy = gy / len;
  const side = dx >= 0 ? 1 : -1;
  const x = side * f.side * 0.9 + dx * 0.12 * k, y = f.cy + dy * 0.12 * k;
  mitten(ctx, x, y, Math.atan2(dy, dx) + Math.PI / 2, f.mitten, 0.6 + 0.4 * k);
}

function stretchMittens(ctx, f, pose) {
  const k = pose.reach;
  for (const side of [-1, 1]) {
    const x = lerp(side * f.side, side * f.side * 0.55, k);
    const y = lerp(f.cy + 0.08, f.top - 0.1, k) + Math.sin(pose.t * 7 + side) * 0.01 * k;
    mitten(ctx, x, y, side * lerp(0.6, 0.15, k), f.mitten, 0.7 + 0.3 * k);
  }
}

function desk(ctx, x, t, progress) {
  ctx.save();
  ctx.translate(x, 0);
  const top = -0.14, w = 0.92;
  // legs
  ctx.fillStyle = '#B9805A';
  for (const s of [-1, 1]) { roundRect(ctx, s * w * 0.4 - 0.02, top, 0.04, -top, 0.01); ctx.fill(); }
  // contact shadow
  const sh = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 0.55);
  sh.addColorStop(0, 'rgba(110,50,30,0.18)');
  sh.addColorStop(1, 'rgba(110,50,30,0)');
  ctx.save(); ctx.scale(1, 0.12); ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(0, 0, w * 0.55, 0, TAU); ctx.fill(); ctx.restore();
  // top slab
  const g = ctx.createLinearGradient(0, top - 0.03, 0, top + 0.03);
  g.addColorStop(0, '#E7B48A');
  g.addColorStop(1, '#C88B60');
  ctx.fillStyle = g;
  roundRect(ctx, -w / 2, top - 0.035, w, 0.05, 0.022);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  roundRect(ctx, -w / 2 + 0.03, top - 0.033, w - 0.06, 0.01, 0.005);
  ctx.fill();
  // open book
  ctx.save();
  ctx.translate(-0.05, top - 0.04);
  const flip = Math.sin(t * 0.7) > 0.97 ? Math.sin(t * 20) * 0.02 : 0;
  for (const s of [-1, 1]) {
    ctx.fillStyle = s < 0 ? '#FFFDF8' : '#FFF6EA';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(s * 0.07, -0.03 - (s > 0 ? flip : 0), s * 0.15, -0.012);
    ctx.lineTo(s * 0.15, 0.012);
    ctx.quadraticCurveTo(s * 0.07, -0.004, 0, 0.016);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,80,60,0.25)';
    ctx.lineWidth = 0.003;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(s * 0.025, -0.006 - i * 0.002);
      ctx.quadraticCurveTo(s * 0.07, -0.02 - i * 0.001, s * 0.125, -0.008 - i * 0.0005);
      ctx.stroke();
    }
  }
  ctx.fillStyle = '#F2735F';
  roundRect(ctx, -0.155, 0.01, 0.31, 0.014, 0.006);
  ctx.fill();
  ctx.restore();
  // tiny mug with steam
  ctx.save();
  ctx.translate(0.3, top - 0.035);
  ctx.fillStyle = '#7BD3B0';
  roundRect(ctx, -0.028, -0.055, 0.056, 0.055, 0.012);
  ctx.fill();
  ctx.strokeStyle = '#7BD3B0';
  ctx.lineWidth = 0.009;
  ctx.beginPath(); ctx.arc(0.03, -0.03, 0.014, -Math.PI / 2, Math.PI / 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 0.006;
  ctx.lineCap = 'round';
  for (const s of [-1, 1]) {
    const ph = t * 1.4 + s;
    ctx.globalAlpha = 0.5 + 0.3 * Math.sin(ph);
    ctx.beginPath();
    ctx.moveTo(s * 0.01, -0.065);
    ctx.bezierCurveTo(s * 0.01 + 0.012, -0.08, s * 0.01 - 0.012, -0.095, s * 0.01 + Math.sin(ph) * 0.006, -0.11);
    ctx.stroke();
  }
  ctx.restore();
  // progress ribbon along the desk edge
  if (progress > 0) {
    ctx.fillStyle = 'rgba(242,115,95,0.85)';
    roundRect(ctx, -w / 2 + 0.03, top + 0.004, (w - 0.06) * clamp(progress, 0, 1), 0.008, 0.004);
    ctx.fill();
  }
  ctx.restore();
}

function hourglass(ctx, x, y, t) {
  const h = 0.2, w = 0.11;
  const cycle = 8;
  const u = (t % cycle) / cycle;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(110,50,30,0.15)';
  ctx.beginPath(); ctx.ellipse(0, 0, w * 0.7, 0.018, 0, 0, TAU); ctx.fill();
  ctx.translate(0, -h / 2 - 0.015);
  // sand
  ctx.fillStyle = '#F5C26B';
  const topSand = 1 - u, botSand = u;
  ctx.beginPath();
  ctx.moveTo(-w * 0.36 * topSand, -h * 0.06 - h * 0.34 * topSand);
  ctx.lineTo(w * 0.36 * topSand, -h * 0.06 - h * 0.34 * topSand);
  ctx.lineTo(0, -h * 0.03);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-w * 0.4, h * 0.42);
  ctx.lineTo(w * 0.4, h * 0.42);
  ctx.lineTo(0, h * 0.42 - h * 0.3 * botSand);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#F5C26B';
  ctx.lineWidth = 0.004;
  ctx.beginPath(); ctx.moveTo(0, -h * 0.03); ctx.lineTo(0, h * 0.42 - h * 0.3 * botSand); ctx.stroke();
  // glass
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 0.008;
  ctx.beginPath();
  ctx.moveTo(-w * 0.42, -h * 0.44);
  ctx.bezierCurveTo(-w * 0.42, -h * 0.1, -0.008, -h * 0.06, -0.008, 0);
  ctx.bezierCurveTo(-0.008, h * 0.06, -w * 0.42, h * 0.1, -w * 0.42, h * 0.44);
  ctx.moveTo(w * 0.42, -h * 0.44);
  ctx.bezierCurveTo(w * 0.42, -h * 0.1, 0.008, -h * 0.06, 0.008, 0);
  ctx.bezierCurveTo(0.008, h * 0.06, w * 0.42, h * 0.1, w * 0.42, h * 0.44);
  ctx.stroke();
  // wooden caps
  ctx.fillStyle = '#B9805A';
  for (const s of [-1, 1]) { roundRect(ctx, -w / 2, s * h / 2 - 0.012, w, 0.024, 0.01); ctx.fill(); }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
