// Backdrops: painted scenes behind the pet (made with Kling), or the pet's own colours.
// Bought in the Shop with coins (the first two are free).
// `floor` = how far down the image (0..1) its empty floor spot sits, so the scene can
// be positioned with the spot under the pet.

export const BACKDROPS = Object.freeze([
  { id: 'none', name: 'Pet colours', price: 0 },
  { id: 'bedroom', name: 'Cosy room', floor: 0.86, price: 0 },
  { id: 'beach', name: 'Sunset beach', floor: 0.86, price: 60 },
  { id: 'forest', name: 'Forest', floor: 0.8, price: 60 },
  { id: 'space', name: 'Space station', floor: 0.86, price: 120 },
  { id: 'cabin', name: 'Snowy cabin', floor: 0.88, price: 80 },
  { id: 'candy', name: 'Candy clouds', floor: 0.82, price: 80 },
].map((b) => Object.freeze(b)));

export const backdropById = (id) => BACKDROPS.find((b) => b.id === id) ?? BACKDROPS[0];

export const backdropUrl = (b) => (b.id === 'none' ? null : `backdrops/${b.id}.webp`);

const MAX_ZOOM = 1.35;

/**
 * Where to draw a backdrop (px, like CSS background-size/position) so it covers a W×H
 * screen and its empty floor spot sits on the pet's ground line (`groundY` px). Zooms in
 * a little (≤ 1.35× cover) when that's what it takes; otherwise gets as close as it can.
 * @returns {{w:number, h:number, x:number, y:number}}
 */
export function backdropLayout(b, W, H, groundY, imgAspect = 9 / 16) {
  const coverH = Math.max(W, H * imgAspect) / imgAspect;
  // Tall enough that the floor spot can reach groundY while the bottom edge still covers.
  const wanted = b.floor ? (H - groundY) / Math.max(0.05, 1 - b.floor) : coverH;
  const h = Math.min(coverH * MAX_ZOOM, Math.max(coverH, wanted));
  const w = h * imgAspect;
  const y = b.floor ? Math.min(0, Math.max(H - h, groundY - b.floor * h)) : (H - h) / 2;
  return { w, h, x: (W - w) / 2, y };
}
