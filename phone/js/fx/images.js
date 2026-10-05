// Tiny image cache for canvas drawing (snack pictures, wardrobe sprites, photo frames).
// `ready(src)` returns the decoded image, or null while it is still loading (callers
// draw a fallback that frame). `load(src)` is the promise version for one-off use.

const cache = new Map();

function entry(src) {
  let e = cache.get(src);
  if (!e) {
    e = { img: null, ok: false, promise: null };
    if (typeof Image === 'function') {
      const img = new Image();
      img.decoding = 'async';
      e.img = img;
      e.promise = new Promise((resolve) => {
        img.onload = () => { e.ok = true; resolve(img); };
        img.onerror = () => resolve(null);
      });
      img.src = src;
    } else {
      e.promise = Promise.resolve(null);
    }
    cache.set(src, e);
  }
  return e;
}

/** The image if it has loaded, else null (and starts loading it). */
export function ready(src) {
  const e = entry(src);
  return e.ok ? e.img : null;
}

/** Resolves to the loaded image, or null if it failed. */
export function load(src) {
  return entry(src).promise;
}

/** Starts loading a list of images in the background. */
export function preload(srcs) {
  for (const src of srcs) entry(src);
}
