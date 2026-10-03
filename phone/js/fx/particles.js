// Little expressive particles drawn in stage units (origin = pet's ground center).
// Each kind has its own motion + drawing; all fade out over their lifetime.

import { drawStar } from '../pet/face.js';

const TAU = Math.PI * 2;
const MAX = 90;

const KINDS = {
  heart: { life: 1.4, g: -0.18, drag: 1.4, size: 0.055, color: '#FF6F7D' },
  sparkle: { life: 0.9, g: 0, drag: 2.5, size: 0.035, color: '#FFD36B' },
  zzz: { life: 2.6, g: -0.05, drag: 0.6, size: 0.06, color: '#8C7BB8' },
  note: { life: 1.6, g: -0.12, drag: 1.1, size: 0.05, color: '#7B6CF2' },
  confetti: { life: 1.8, g: 0.9, drag: 1.2, size: 0.022, color: null },
  bang: { life: 0.55, g: 0, drag: 6, size: 0.05, color: '#F2735F' },
  drop: { life: 1.0, g: 0.6, drag: 0.5, size: 0.03, color: '#7CC4F5' },
  ember: { life: 1.3, g: -0.45, drag: 0.8, size: 0.018, color: '#FFB347' },
  bubble: { life: 2.2, g: -0.12, drag: 0.4, size: 0.025, color: '#BFE6FF' },
  rain: { life: 0.7, g: 1.4, drag: 0, size: 0.012, color: '#9CC8F0' },
};
const CONFETTI = ['#F2735F', '#FFD36B', '#7BD3B0', '#8EA8FF', '#FF9CC2'];

export class Particles {
  constructor(rand = Math.random) {
    this.rand = rand;
    this.list = [];
  }

  emit(kind, x, y, opts = {}) {
    const k = KINDS[kind];
    if (!k) return;
    const r = this.rand;
    const spread = opts.spread ?? 0.6;
    const speed = opts.speed ?? 0.5;
    const a = (opts.angle ?? -Math.PI / 2) + (r() - 0.5) * spread;
    const p = {
      kind, x, y,
      vx: Math.cos(a) * speed * (0.6 + r() * 0.6),
      vy: Math.sin(a) * speed * (0.6 + r() * 0.6),
      age: 0,
      life: k.life * (0.8 + r() * 0.4),
      size: k.size * (opts.scale ?? 1) * (0.8 + r() * 0.45),
      rot: r() * TAU,
      spin: (r() - 0.5) * 6,
      color: k.color ?? CONFETTI[Math.floor(r() * CONFETTI.length)],
      text: opts.text,
      seed: r() * 10,
    };
    this.list = [...this.list.slice(-(MAX - 1)), p];
  }

  burst(kind, x, y, count, opts) {
    for (let i = 0; i < count; i++) this.emit(kind, x, y, opts);
  }

  update(dt) {
    this.list = this.list
      .map((p) => {
        const k = KINDS[p.kind];
        const drag = Math.exp(-k.drag * dt);
        const wiggle = p.kind === 'heart' || p.kind === 'zzz' || p.kind === 'note' ? Math.sin((p.age + p.seed) * 5) * 0.06 : 0;
        return {
          ...p,
          age: p.age + dt,
          vx: p.vx * drag + wiggle * dt * 4,
          vy: p.vy * drag + k.g * dt,
          x: p.x + p.vx * dt,
          y: p.y + p.vy * dt,
          rot: p.rot + p.spin * dt,
        };
      })
      .filter((p) => p.age < p.life);
  }

  get active() {
    return this.list.length > 0;
  }

  draw(ctx) {
    for (const p of this.list) {
      const u = p.age / p.life;
      const alpha = u < 0.15 ? u / 0.15 : 1 - Math.max(0, (u - 0.6) / 0.4);
      const grow = p.kind === 'zzz' ? 0.6 + u * 0.8 : u < 0.2 ? 0.5 + u * 2.5 : 1;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.translate(p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;
      const s = p.size * grow;
      switch (p.kind) {
        case 'heart': heart(ctx, s); break;
        case 'sparkle': ctx.rotate(p.rot * 0.2); drawStar(ctx, 0, 0, s, 0); break;
        case 'zzz': text(ctx, 'z', s * 1.6, p.rot * 0.05); break;
        case 'note': text(ctx, p.seed > 5 ? '♪' : '♫', s * 1.5, Math.sin(p.age * 4) * 0.2); break;
        case 'confetti': ctx.rotate(p.rot); ctx.fillRect(-s, -s * 0.5, s * 2, s); break;
        case 'bang': bang(ctx, s, u); break;
        case 'drop': drop(ctx, s); break;
        case 'ember': ctx.beginPath(); ctx.arc(0, 0, s * (1 - u * 0.6), 0, TAU); ctx.fill(); break;
        case 'bubble': ctx.lineWidth = s * 0.25; ctx.beginPath(); ctx.arc(0, 0, s, 0, TAU); ctx.stroke(); break;
        case 'rain': ctx.lineWidth = s * 0.8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, s * 4); ctx.stroke(); break;
        default: break;
      }
      ctx.restore();
    }
  }
}

function heart(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(0, s * 0.35);
  ctx.bezierCurveTo(-s * 1.1, -s * 0.35, -s * 0.45, -s * 1.05, 0, -s * 0.45);
  ctx.bezierCurveTo(s * 0.45, -s * 1.05, s * 1.1, -s * 0.35, 0, s * 0.35);
  ctx.fill();
}

function text(ctx, str, size, rot) {
  ctx.rotate(rot);
  ctx.font = `700 ${size}px Nunito, ui-rounded, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(str, 0, 0);
}

function bang(ctx, s, u) {
  ctx.lineWidth = s * 0.28;
  ctx.lineCap = 'round';
  const d0 = s * (0.6 + u * 1.2), d1 = s * (1.3 + u * 1.4);
  for (const a of [-Math.PI / 2, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55]) {
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * d0, Math.sin(a) * d0);
    ctx.lineTo(Math.cos(a) * d1, Math.sin(a) * d1);
    ctx.stroke();
  }
}

function drop(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(0, -s * 1.4);
  ctx.quadraticCurveTo(s, 0, 0, s);
  ctx.quadraticCurveTo(-s, 0, 0, -s * 1.4);
  ctx.fill();
}
