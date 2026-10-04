// Photo mode: composes a polaroid of the pet from the three stage layers (back props,
// WebGL clay body, 2D face/props/particles) over the pet's own background colours.
// Must run in the same frame the stage was drawn, so the WebGL buffer is still there.

import { photoCrop, photoDate } from '../core/photo.js';

const W = 1080;
const BORDER = 54;
const PHOTO = W - BORDER * 2;
const H = BORDER + PHOTO + 250;

/**
 * @param {{canvases: HTMLCanvasElement[], center: {x:number,y:number}, S: number, dpr: number,
 *          palette: {bgA:string,bgB:string,accent:string}, name: string, level: number, date?: Date}} o
 * @returns {HTMLCanvasElement}
 */
export function composePhoto(o) {
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#FFFDF9';
  ctx.fillRect(0, 0, W, H);

  // Photo area: the pet's sky + floor, then the stage layers.
  ctx.save();
  ctx.beginPath();
  ctx.rect(BORDER, BORDER, PHOTO, PHOTO);
  ctx.clip();
  const sky = ctx.createLinearGradient(0, BORDER, 0, BORDER + PHOTO);
  sky.addColorStop(0, o.palette.bgA);
  sky.addColorStop(1, o.palette.bgB);
  ctx.fillStyle = sky;
  ctx.fillRect(BORDER, BORDER, PHOTO, PHOTO);
  const glow = ctx.createRadialGradient(W / 2, BORDER + PHOTO * 0.42, 0, W / 2, BORDER + PHOTO * 0.42, PHOTO * 0.6);
  glow.addColorStop(0, 'rgba(255,255,255,0.55)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(BORDER, BORDER, PHOTO, PHOTO);

  const first = o.canvases.find(Boolean);
  const crop = photoCrop(o.center, o.S, o.dpr, { w: first.width, h: first.height });
  for (const c of o.canvases) {
    if (c?.width) ctx.drawImage(c, crop.x, crop.y, crop.w, crop.h, BORDER, BORDER, PHOTO, PHOTO);
  }
  // soft vignette
  const v = ctx.createRadialGradient(W / 2, BORDER + PHOTO / 2, PHOTO * 0.35, W / 2, BORDER + PHOTO / 2, PHOTO * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(80,30,20,0.12)');
  ctx.fillStyle = v;
  ctx.fillRect(BORDER, BORDER, PHOTO, PHOTO);
  ctx.restore();

  // Caption
  const y = BORDER + PHOTO;
  ctx.fillStyle = '#3A221C';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '900 76px Nunito, ui-rounded, system-ui, sans-serif';
  ctx.fillText(o.name, BORDER + 8, y + 118);
  ctx.font = '700 38px Nunito, ui-rounded, system-ui, sans-serif';
  ctx.fillStyle = '#8A6A60';
  ctx.fillText(`Bond level ${o.level} · ${photoDate(o.date ?? new Date())}`, BORDER + 10, y + 178);
  heart(ctx, W - BORDER - 70, y + 100, 34, o.palette.accent);
  ctx.font = '800 26px Nunito, ui-rounded, system-ui, sans-serif';
  ctx.fillStyle = '#B49A90';
  ctx.textAlign = 'right';
  ctx.fillText('Peek Pets', W - BORDER - 10, y + 178);
  return out;
}

function heart(ctx, x, y, s, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.15);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, s * 0.35);
  ctx.bezierCurveTo(-s * 1.1, -s * 0.35, -s * 0.45, -s * 1.05, 0, -s * 0.45);
  ctx.bezierCurveTo(s * 0.45, -s * 1.05, s * 1.1, -s * 0.35, 0, s * 0.35);
  ctx.fill();
  ctx.restore();
}

/** canvas → PNG blob */
export function toBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}
