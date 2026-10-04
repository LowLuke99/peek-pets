// Wires the v3 "play" features into the app: wardrobe outfits, snacks, shake & tilt,
// and photo mode. The app calls a few hooks (frame, gaze, pose, afterDraw…); all the
// state for these features lives here so app.js stays about the core pet.

import { store } from '../store.js';
import { $ } from '../ui/dom.js';
import { wear, outfitFor, bestLevel, unlockedBetween } from '../core/wardrobe.js';
import { photoFileName } from '../core/photo.js';
import { backdropById, backdropUrl, backdropLayout } from '../core/backdrops.js';
import { pickLine } from '../behavior/lines.js';
import { haptic } from '../native.js';
import { SnackTime } from './snacks.js';
import { MotionSense } from './motion.js';
import { composePhoto, toBlob } from './photo.js';
import { SnackBar } from '../ui/snackBar.js';
import { styleSheet, photoSheet } from '../ui/styleSheet.js';

const PHOTO_POSE_MS = 650;

export class PlayGlue {
  constructor(app) {
    this.app = app;
    this.outfits = store.get('outfits') ?? {};
    this.snacks = new SnackTime(app);
    this.motion = new MotionSense({ onShake: () => this.onShake() });
    this.photoAt = null;
    this.snackBar = new SnackBar({
      onPick: (id, from) => { this.snacks.feed(id, from); this.snackBar.hide(); },
      onToggle: (open) => {
        app.ui.setPressed('snack', open);
        document.querySelector('[data-action="snack"]')?.setAttribute('aria-expanded', String(open));
      },
    });
    $('#styleBtn')?.addEventListener('click', () => app.openSheet('style'));
    this.backdropImg = null;
    window.addEventListener('resize', () => requestAnimationFrame(() => this.layoutBackdrop()));
    this.applyBackdrop();
  }

  // ---------------------------------------------------------------- backdrops
  applyBackdrop() {
    const b = backdropById(this.app.settings.backdrop);
    const url = backdropUrl(b);
    const el = $('#backdrop');
    document.documentElement.classList.toggle('has-backdrop', Boolean(url));
    this.backdrop = b;
    if (!url || !el) { this.backdropImg = null; return; }
    el.style.backgroundImage = `url("${url}")`;
    const img = new Image();
    img.src = url; // kept for photos (drawn under the pet)
    this.backdropImg = img;
    this.layoutBackdrop();
  }

  /** Lines the scene's empty floor spot up under the pet (see core/backdrops.js). */
  layoutBackdrop() {
    const el = $('#backdrop');
    const r = this.app.renderer;
    if (!el || !this.backdropImg) return;
    const l = backdropLayout(this.backdrop, r.W, r.H, r.baseOy);
    el.style.backgroundSize = `${l.w}px ${l.h}px`;
    el.style.backgroundPosition = `${l.x}px ${l.y}px`;
    this.layout = l;
  }

  setBackdrop(id) {
    this.app.setSetting('backdrop', id);
    this.applyBackdrop();
  }

  get outfit() {
    return outfitFor(this.outfits, this.app.species.id);
  }

  get busy() {
    return this.snacks.active || this.photoAt !== null;
  }

  // ---------------------------------------------------------------- hooks from App
  frame(dt) {
    this.snacks.update(dt);
    const tilt = this.motion.update(dt);
    this.app.ball.tilt = tilt.x;
  }

  /** Overrides the gaze target while a snack is flying (stage units) or null. */
  lookPoint() {
    return this.snacks.lookPoint();
  }

  applyToPose(pose) {
    return this.motion.applyToPose(pose);
  }

  drawToys(ctx) {
    this.app.ball.draw(ctx);
    this.snacks.draw(ctx);
  }

  /** Runs right after the stage is drawn (the WebGL frame is still readable). */
  afterDraw(now) {
    if (this.photoAt === null || now < this.photoAt) return;
    this.photoAt = null;
    this.snap();
  }

  action(name) {
    if (name !== 'snack') return false;
    this.app.sfx.unlock();
    this.snackBar.toggle(this.snacks.menu);
    return true;
  }

  onLevelUp(beforeBest, afterBest) {
    const fresh = unlockedBetween(beforeBest, afterBest);
    if (fresh.length) setTimeout(() => this.app.ui.toast(`New in your wardrobe: ${fresh.map((i) => i.name).join(', ')}!`, 3200), 1500);
  }

  bestLevel() {
    return bestLevel(this.app.bonds);
  }

  async setMotion(on) {
    if (!on) { this.motion.disable(); return true; }
    const ok = await this.motion.enable();
    if (!ok) this.app.ui.toast('Motion sensors not available or not allowed');
    return ok;
  }

  onShake() {
    const app = this.app;
    app.rig.perform('shake');
    app.react({ type: 'cursor-spin' });
    haptic('warning');
    app.sfx.play('dizzy');
    const line = pickLine('shake', {}, app.species);
    if (line) app.ui.say(line, 2200);
    if (app.ball.active) app.ball.fling((Math.random() - 0.5) * 5, -3.5);
    app.send('shake');
  }

  // ---------------------------------------------------------------- style + photo
  styleSheet() {
    const app = this.app;
    return styleSheet({
      outfit: this.outfit,
      bonds: app.bonds,
      accent: app.species.palette.accent,
      petName: app.species.name,
      backdrop: app.settings.backdrop,
      onBackdrop: (id) => this.setBackdrop(id),
      onWear: (itemId) => this.wear(itemId),
      onPhoto: () => { app.ui.closeSheet(); setTimeout(() => this.takePhoto(), 260); },
    });
  }

  wear(itemId) {
    const app = this.app;
    const before = this.outfit;
    this.outfits = wear(this.outfits, app.species.id, itemId, app.bonds);
    store.set('outfits', this.outfits);
    const now = this.outfit;
    if (now !== before && Object.values(now).includes(itemId)) {
      app.rig.hopUp(0.6);
      const top = app.headStage();
      app.particles.burst('sparkle', top.x, top.y + 0.05, 6, { speed: 0.9, spread: 3 });
      app.sfx.play('pop');
      haptic('soft');
      const line = pickLine('outfit', {}, app.species);
      if (line) app.ui.say(line, 1800);
      app.send('outfit');
    }
    return now;
  }

  takePhoto() {
    if (this.photoAt !== null) return;
    const app = this.app;
    this.snackBar.hide();
    app.react({ type: 'double' });
    app.rig.hopUp(0.5);
    const line = pickLine('cheese', {}, app.species);
    if (line) app.ui.say(line, 1200);
    this.photoAt = performance.now() + PHOTO_POSE_MS;
  }

  async snap() {
    const app = this.app;
    const r = app.renderer;
    const c = r.bodyCenter(app.species, app.pose);
    let canvas;
    try {
      canvas = composePhoto({
        canvases: [r.backCanvas, r.useGl ? r.glCanvas : null, r.canvas].filter(Boolean),
        center: r.toScreen(c.x, c.y),
        S: r.S,
        dpr: r.dpr,
        palette: app.species.palette,
        name: app.species.name,
        level: app.bond.level,
        backdrop: this.backdropImg?.complete && this.layout ? { img: this.backdropImg, ...this.layout } : null,
      });
    } catch {
      app.ui.toast("Couldn't take the photo");
      return;
    }
    const flash = $('#flash');
    flash?.classList.remove('is-on');
    void flash?.offsetWidth;
    flash?.classList.add('is-on');
    app.sfx.play('shutter');
    haptic('tap');
    app.send('photo');
    const blob = await toBlob(canvas);
    if (!blob) { app.ui.toast("Couldn't save the photo"); return; }
    this.lastPhoto = blob;
    const sheet = photoSheet({ blob, fileName: photoFileName(app.species.name, new Date()), petName: app.species.name });
    app.ui.openSheet('photo', 'Snap!', sheet.el);
    app.sheetDispose = sheet.dispose;
  }
}
