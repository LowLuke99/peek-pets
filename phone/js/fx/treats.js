// Draws a snack (its clay picture, or the emoji until the picture has loaded) centred
// on the origin. Used by the snack throw and the games so every treat looks the same.

import { ready } from './images.js';
import { snackById } from '../core/snacks.js';

const FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

/** @returns {boolean} true if the picture was drawn (false = emoji fallback this frame) */
export function drawTreat(ctx, id, size, fallbackEmoji) {
  const snack = snackById(id);
  const img = snack ? ready(snack.img) : null;
  if (img) {
    const s = size * 1.1; // pictures have a little padding; emoji glyphs fill their em box
    ctx.drawImage(img, -s / 2, -s / 2, s, s);
    return true;
  }
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(snack?.emoji ?? fallbackEmoji ?? '⭐', 0, 0);
  return false;
}
