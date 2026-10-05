// Photo mode: captures the pet from the three stage layers (back props, WebGL clay body,
// 2D face/props/particles) over its backdrop or background colours, then wraps that
// square in a polaroid or a clay frame. Capturing must run in the same frame the stage
// was drawn, so the WebGL buffer is still there; wrapping can happen any time after.

import { photoCrop, photoDate, framedLayout, frameUrl } from '../core/photo.js';
import { load } from '../fx/images.js';

const W = 1080;
const BORDER = 54;
const PHOTO = W - BORDER * 2;
const H = BORDER + PHOTO + 250;

/**
 * The square photo (PHOTO px) of the stage around the pet.
 * @param {{canvases: HTMLCanvasElement[], center: {x:number,y:number}, S: number, dpr: number,
 *          palette: {bgA:string,bgB:string,accent:string},
 *          backdrop?: {img: HTMLImageElement, x:number, y:number, w:number, h:number}|null}} o
 * @returns {HTMLCanvasElement}
 */
export function captureScene(o) {
  const out = document.createElement('canvas');
  out.width = out.height = PHOTO;
  const ctx = out.getContext('2d');

  // The pet's sky + floor glow, then the backdrop, then the stage layers.
  const sky = ctx.createLinearGradient(0, 0, 0, PHOTO);
  sky.addColorStop(0, o.palette.bgA);
  sky.addColorStop(1, o.palette.bgB);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, PHOTO, PHOTO);
  const glow = ctx.createRadialGradient(PHOTO / 2, PHOTO * 0.42, 0, PHOTO / 2, PHOTO * 0.42, PHOTO * 0.6);
  glow.addColorStop(0, 'rgba(255,255,255,0.55)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, PHOTO, PHOTO);

  const first = o.canvases.find(Boolean);
  const crop = photoCrop(o.center, o.S, o.dpr, { w: first.width, h: first.height });
  if (o.backdrop) {
    // Same placement as on screen (CSS px → canvas px → photo px).
    const k = PHOTO / crop.w;
    const b = o.backdrop;
    ctx.drawImage(b.img, (b.x * o.dpr - crop.x) * k, (b.y * o.dpr - crop.y) * k, b.w * o.dpr * k, b.h * o.dpr * k);
  }
  for (const c of o.canvases) {
    if (c?.width) ctx.drawImage(c, crop.x, crop.y, crop.w, crop.h, 0, 0, PHOTO, PHOTO);
  }
  // soft vignette
  const v = ctx.createRadialGradient(PHOTO / 2, PHOTO / 2, PHOTO * 0.35, PHOTO / 2, PHOTO / 2, PHOTO * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(80,30,20,0.12)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, PHOTO, PHOTO);
  return out;
}

/**
 * The finished photo: a polaroid with a caption, or the scene inside a clay frame.
 * @param {HTMLCanvasElement} scene from captureScene
 * @param {object} frame an entry of PHOTO_FRAMES
 * @param {{name: string, level: number, accent: string, date?: Date}} meta
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function framePhoto(scene, frame, meta) {
  const url = frameUrl(frame);
  const img = url ? await load(url) : null;
  return img ? framed(scene, frame, img) : polaroid(scene, meta);
}

function polaroid(scene, meta) {
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#FFFDF9';
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(scene, BORDER, BORDER, PHOTO, PHOTO);

  const y = BORDER + PHOTO;
  ctx.fillStyle = '#3A221C';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '900 76px Nunito, ui-rounded, system-ui, sans-serif';
  ctx.fillText(meta.name, BORDER + 8, y + 118);
  ctx.font = '700 38px Nunito, ui-rounded, system-ui, sans-serif';
  ctx.fillStyle = '#8A6A60';
  ctx.fillText(`Level ${meta.level} · ${photoDate(meta.date ?? new Date())}`, BORDER + 10, y + 178);
  heart(ctx, W - BORDER - 70, y + 100, 34, meta.accent);
  ctx.font = '800 26px Nunito, ui-rounded, system-ui, sans-serif';
  ctx.fillStyle = '#B49A90';
  ctx.textAlign = 'right';
  ctx.fillText('Peek Pets', W - BORDER - 10, y + 178);
  return out;
}

function framed(scene, frame, img) {
  const L = framedLayout(frame, W);
  const out = document.createElement('canvas');
  out.width = L.W;
  out.height = L.H;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#FFFDF9'; // frames have see-through corners; photo apps show those as black
  ctx.fillRect(0, 0, L.W, L.H);
  ctx.save();
  ctx.beginPath();
  ctx.rect(L.win.x, L.win.y, L.win.w, L.win.h);
  ctx.clip();
  ctx.drawImage(scene, L.photo.x, L.photo.y, L.photo.size, L.photo.size);
  ctx.restore();
  ctx.drawImage(img, 0, 0, L.W, L.H);
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
