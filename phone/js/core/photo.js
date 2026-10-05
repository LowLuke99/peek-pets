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

// Frames for a finished photo: the plain polaroid, or a clay frame (img/frames/<id>.webp)
// whose see-through window (fractions of the frame: left, top, right, bottom) holds the
// photo. Window boxes are measured by tools/art/build-art.py.
export const PHOTO_FRAMES = Object.freeze([
  { id: 'polaroid', name: 'Polaroid' },
  { id: 'birthday', name: 'Party', aspect: 0.6667, window: [0.1768, 0.1849, 0.8389, 0.7988] },
  { id: 'spooky', name: 'Spooky', aspect: 0.8333, window: [0.1755, 0.1601, 0.8236, 0.7547] },
  { id: 'winter', name: 'Snowy', aspect: 0.9137, window: [0.1743, 0.1578, 0.8265, 0.75] },
].map((f) => Object.freeze(f)));

export const frameById = (id) => PHOTO_FRAMES.find((f) => f.id === id) ?? PHOTO_FRAMES[0];
export const frameUrl = (f) => (f.window ? `img/frames/${f.id}.webp` : null);

const BLEED = 0.012; // the photo runs a little under the frame so no gap shows at its soft inner edge

/**
 * Where things go on a framed photo `W` px wide: the canvas height, and the square
 * photo (cover-fit, centred on the window) in px.
 */
export function framedLayout(frame, W) {
  const H = Math.round(W / frame.aspect);
  const [l, t, r, b] = frame.window;
  const win = { x: (l - BLEED) * W, y: (t - BLEED) * H, w: (r - l + 2 * BLEED) * W, h: (b - t + 2 * BLEED) * H };
  const side = Math.max(win.w, win.h);
  return { W, H, win, photo: { x: win.x + (win.w - side) / 2, y: win.y + (win.h - side) / 2, size: side } };
}
