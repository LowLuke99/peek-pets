// Builds the GL part list for one frame: pedestal, soft floor shadows, optional glow,
// then the pet's own parts under exactly the transform the 2D face layer uses.

import { shade } from '../pet/face.js';

/** Applies the pet's pose transform to anything with translate/rotate/scale (ctx or PartBuilder). */
export function applyPetTransform(t, species, pose, hoverY) {
  if (species.grounded) {
    t.translate(pose.x, pose.y);
    t.rotate(pose.rot);
    t.scale(pose.sx, pose.sy);
    t.translate(0, -species.groundY);
  } else {
    t.translate(pose.x, pose.y - species.floatY - hoverY);
    t.rotate(pose.rot);
    t.scale(pose.sx, pose.sy);
  }
}

/**
 * @param {import('./parts.js').PartBuilder} b reset to stage→device-pixel space
 */
export function buildScene(b, species, pose, state, hoverY) {
  const pal = species.palette;
  if (species.grounded) {
    b.ellipse({ x: pose.x, y: 0.035, rx: 0.8, ry: 0.13 }, { base: 'pedestal', color: pal.pedestal, color2: shade(pal.pedestal, -0.04), sssColor: '#ffffff' });
  }
  const lift = species.grounded ? pose.hop : species.floatY + Math.max(0, pose.hop);
  const k = Math.max(0.35, 1 - lift * 0.9);
  const w = (species.shadowW ?? 0.42) * k * (pose.sx ?? 1);
  b.shadow({ x: pose.x * 0.5, y: 0, rx: w * 0.95, ry: w * 0.2, strength: 0.22 * k });
  if (species.grounded) b.shadow({ x: pose.x, y: 0.004, rx: w * 0.72, ry: w * 0.11, strength: 0.42 * k * k });
  if (species.glow) {
    const g = species.glow(pose, state);
    if (g) {
      b.save();
      applyPetTransform(b, species, pose, hoverY);
      b.glow(g);
      b.restore();
    }
  }
  b.save();
  applyPetTransform(b, species, pose, hoverY);
  species.gl(b, pose, state);
  b.restore();
  return b.parts;
}
