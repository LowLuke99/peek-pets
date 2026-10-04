// Virtual time for filming the app frame by frame (injected before the app loads).
// requestAnimationFrame, setTimeout/setInterval, Date and performance.now all follow a
// virtual clock that only moves when the recorder calls window.__vt.advance(ms); CSS/Web
// Animations are paused and pinned to the same clock. Network and promises run normally.
(() => {
  const START = Date.parse('2026-10-04T15:00:00');
  const RealDate = Date;
  let now = 0;
  let rafId = 1, timerId = 1;
  const raf = new Map();
  const timers = new Map();
  const seen = new WeakMap();

  window.requestAnimationFrame = (cb) => { const id = rafId++; raf.set(id, cb); return id; };
  window.cancelAnimationFrame = (id) => raf.delete(id);
  window.setTimeout = (fn, ms = 0, ...args) => { const id = timerId++; timers.set(id, { at: now + Math.max(0, +ms || 0), fn, args }); return id; };
  window.clearTimeout = (id) => timers.delete(id);
  window.setInterval = (fn, ms = 0, ...args) => { const id = timerId++; const every = Math.max(1, +ms || 1); timers.set(id, { at: now + every, every, fn, args }); return id; };
  window.clearInterval = (id) => timers.delete(id);
  performance.now = () => now;
  class VDate extends RealDate {
    constructor(...a) { super(...(a.length ? a : [START + now])); }
    static now() { return START + now; }
  }
  window.Date = VDate;

  function runTimers(target) {
    for (;;) {
      let next = null;
      for (const [id, t] of timers) if (t.at <= target && (!next || t.at < next[1].at)) next = [id, t];
      if (!next) return;
      const [id, t] = next;
      now = Math.max(now, t.at);
      if (t.every) timers.set(id, { ...t, at: now + t.every }); else timers.delete(id);
      try { typeof t.fn === 'function' ? t.fn(...t.args) : null; } catch (e) { console.error(e); }
    }
  }

  function pinAnimations() {
    for (const a of document.getAnimations()) {
      if (!seen.has(a)) { seen.set(a, now); a.pause(); }
      a.currentTime = now - seen.get(a);
    }
  }

  window.__vt = {
    get now() { return now; },
    advance(ms) {
      const target = now + ms;
      runTimers(target);
      now = target;
      const frame = [...raf.values()];
      raf.clear();
      for (const cb of frame) { try { cb(now); } catch (e) { console.error(e); } }
      pinAnimations();
    },
  };
})();
