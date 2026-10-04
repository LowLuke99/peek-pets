// Photo mode helpers (pure): where to crop the stage canvases, and caption text.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CROP_BODIES = 2.4; // the square is this many body-widths across (room for hats)

/**
 * Square crop (device px) around the pet.
 * @param {{x:number,y:number}} center pet body centre in CSS px
 * @param {number} S stage scale (CSS px per body width)
 * @param {number} dpr canvas pixels per CSS px
 * @param {{w:number,h:number}} canvas canvas size in device px
 */
export function photoCrop(center, S, dpr, canvas) {
  const size = Math.round(Math.min(S * CROP_BODIES * dpr, canvas.w, canvas.h));
  const cx = center.x * dpr, cy = (center.y - S * 0.12) * dpr;
  const x = Math.round(Math.min(canvas.w - size, Math.max(0, cx - size / 2)));
  const y = Math.round(Math.min(canvas.h - size, Math.max(0, cy - size / 2)));
  return { x, y, w: size, h: size };
}

export function photoDate(d) {
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

const pad = (n) => String(n).padStart(2, '0');

export function photoFileName(petName, d) {
  const slug = String(petName).toLowerCase().replace(/[^a-z0-9]+/g, '') || 'pet';
  return `peek-pets-${slug}-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.png`;
}
