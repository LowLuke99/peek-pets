// Best-effort "keep the screen on" so the pet stays visible on a desk.
// Screen Wake Lock needs a secure (HTTPS) page; over plain LAN HTTP we fall back to a
// tiny looping muted video, which iOS treats as media playback.

export class KeepAwake {
  constructor() {
    this.lock = null;
    this.video = null;
    this.wanted = false;
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.wanted) this.enable();
    });
  }

  get method() {
    if (this.lock) return 'wake-lock';
    if (this.video && !this.video.paused) return 'video';
    return 'off';
  }

  /** Must be called from a user gesture the first time (iOS media rules). */
  async enable() {
    this.wanted = true;
    if ('wakeLock' in navigator && window.isSecureContext) {
      try {
        this.lock = await navigator.wakeLock.request('screen');
        this.lock.addEventListener('release', () => { this.lock = null; });
        return this.method;
      } catch { /* fall through */ }
    }
    if (!this.video) {
      const v = document.createElement('video');
      v.setAttribute('playsinline', '');
      v.setAttribute('muted', '');
      v.muted = true;
      v.loop = true;
      v.src = 'media/awake.mp4';
      v.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;';
      document.body.append(v);
      this.video = v;
    }
    try { await this.video.play(); } catch { /* needs a gesture; retried on next tap */ }
    return this.method;
  }

  disable() {
    this.wanted = false;
    this.lock?.release().catch(() => {});
    this.lock = null;
    this.video?.pause();
  }
}
