// Turns raw pointer events on the stage into pet gestures:
// tap / double-tap / long-press (hug) / stroke (petting) / finger-look / ball drag+flick.

const MOVE_SLOP = 10;
const DOUBLE_TAP_MS = 300;
const LONG_PRESS_MS = 520;

/**
 * @param {HTMLElement} el
 * @param {{hitTest:(x:number,y:number)=>object|null, ballAt:(x:number,y:number)=>boolean, onAnyTouch:Function,
 *   onTap:Function, onDoubleTap:Function, onLongPress:Function, onStroke:Function, onLook:Function, onLookEnd:Function,
 *   onBallDrag:Function, onBallRelease:Function}} h
 */
export function attachInput(el, h) {
  let down = null;
  let lastTap = { at: 0, hit: null };
  let longTimer = null;

  el.addEventListener('pointerdown', (e) => {
    if (down) return; // single-finger interactions only
    el.setPointerCapture?.(e.pointerId);
    h.onAnyTouch();
    const now = performance.now();
    down = {
      id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: now, t: now,
      vx: 0, vy: 0, moved: false, long: false,
      onBall: h.ballAt(e.clientX, e.clientY),
      hit: null,
    };
    down.hit = down.onBall ? null : h.hitTest(e.clientX, e.clientY);
    if (down.onBall) h.onBallDrag(e.clientX, e.clientY);
    else if (!down.hit) h.onLook(e.clientX, e.clientY);
    clearTimeout(longTimer);
    longTimer = setTimeout(() => {
      if (down && !down.moved && down.hit) {
        down.long = true;
        h.onLongPress(down.hit);
      }
    }, LONG_PRESS_MS);
  });

  el.addEventListener('pointermove', (e) => {
    if (!down || e.pointerId !== down.id) return;
    const now = performance.now();
    const dt = Math.max(1, now - down.t) / 1000;
    const seg = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    // Smoothed finger velocity (px/s) for flicks.
    down.vx = down.vx * 0.6 + ((e.clientX - down.x) / dt) * 0.4;
    down.vy = down.vy * 0.6 + ((e.clientY - down.y) / dt) * 0.4;
    down.x = e.clientX; down.y = e.clientY; down.t = now;
    if (!down.moved && Math.hypot(down.x - down.x0, down.y - down.y0) > MOVE_SLOP) down.moved = true;
    if (down.onBall) h.onBallDrag(down.x, down.y);
    else if (down.hit && down.moved) {
      if (h.hitTest(down.x, down.y)) h.onStroke(seg, down.x, down.y);
      else h.onLook(down.x, down.y);
    } else if (!down.hit) h.onLook(down.x, down.y);
  });

  const finish = (e, cancelled) => {
    if (!down || e.pointerId !== down.id) return;
    clearTimeout(longTimer);
    const d = down;
    down = null;
    if (d.onBall) {
      const fresh = performance.now() - d.t < 80;
      h.onBallRelease(fresh ? d.vx : 0, fresh ? d.vy : 0);
      return;
    }
    h.onLookEnd();
    if (cancelled || d.moved || d.long) return;
    const now = performance.now();
    if (d.hit && now - lastTap.at < DOUBLE_TAP_MS && lastTap.hit) {
      lastTap = { at: 0, hit: null };
      h.onDoubleTap(d.hit, d.x, d.y);
      return;
    }
    lastTap = { at: now, hit: d.hit };
    h.onTap(d.hit, d.x, d.y);
  };
  el.addEventListener('pointerup', (e) => finish(e, false));
  el.addEventListener('pointercancel', (e) => finish(e, true));
}
