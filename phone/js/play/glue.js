// Wires the v3 "play" features into the app: wardrobe outfits, snacks, shake & tilt,
// and photo mode. The app calls a few hooks (frame, gaze, pose, afterDraw…); all the
// state for these features lives here so app.js stays about the core pet.

import { store } from '../store.js';
import { $ } from '../ui/dom.js';
import { WARDROBE, wear, outfitFor, buy, migrateOwned } from '../core/wardrobe.js';
import { photoFileName, PHOTO_FRAMES, frameById, frameUrl } from '../core/photo.js';
import { backdropById, backdropUrl, backdropLayout } from '../core/backdrops.js';
import { pickLine } from '../behavior/lines.js';
import { haptic } from '../native.js';
import { SnackTime } from './snacks.js';
import { MotionSense } from './motion.js';
import { captureScene, framePhoto, toBlob } from './photo.js';
import { preload } from '../fx/images.js';
import { ChoiceBar } from '../ui/choiceBar.js';
import { styleSheet, photoSheet } from '../ui/styleSheet.js';
import { GAMES } from '../games/host.js';

const PHOTO_POSE_MS = 650;

export class PlayGlue {
  constructor(app) {
    this.app = app;
    this.outfits = store.get('outfits') ?? {};
    this.owned = store.get('owned');
    if (!Array.isArray(this.owned)) { // first run after coins replaced level unlocks
      const oldLevel = Math.max(1, ...Object.values(store.get('bonds') ?? {}).map((b) => Number(b?.level) || 1));
      this.owned = migrateOwned(this.outfits, app.settings.backdrop, oldLevel);
      store.set('owned', this.owned);
    }
    this.snacks = new SnackTime(app);
    this.motion = new MotionSense({ onShake: () => this.onShake() });
    this.photoAt = null;
    this.snackBar = new ChoiceBar({
      el: '#snackbar',
      action: 'snack',
      onPick: (id, from) => { this.snacks.feed(id, from); this.snackBar.hide(); },
      onToggle: (open) => {
        app.ui.setPressed('snack', open);
        document.querySelector('[data-action="snack"]')?.setAttribute('aria-expanded', String(open));
      },
    });
    this.playBar = new ChoiceBar({
      el: '#playbar',
      action: 'play',
      onPick: (id) => { this.playBar.hide(); if (id === 'ball') app.toggleBall(); else app.games.start(id); },
      onToggle: (open) => document.querySelector('[data-action="play"]')?.setAttribute('aria-expanded', String(open)),
    });
    this.backdropImg = null;
    this.outfitCache = null;
    preload(WARDROBE.map((i) => i.img));
    window.addEventListener('resize', () => requestAnimationFrame(() => this.layoutBackdrop()));
    this.applyBackdrop();
    if (app.settings.motion) this.resumeMotionOnTap();
  }

  /**
   * Shake & tilt was on last time. iOS only grants motion access during a real tap
   * (touchend/click, not touch-down), so ask on the first one, once.
   */
  resumeMotionOnTap() {
    const once = () => {
      document.removeEventListener('touchend', once);
      document.removeEventListener('click', once);
      if (this.app.settings.motion && !this.motion.on) this.app.setSetting('motion', true);
    };
    document.addEventListener('touchend', once);
    document.addEventListener('click', once);
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

  /** Shop purchase (wardrobe item or backdrop). Returns true if bought. */
  buy(entry) {
    const app = this.app;
    const r = buy(entry, this.owned, app.wallet);
    if (r.error === 'coins') { app.ui.toast(`Need ${entry.price - app.wallet.coins} more 🪙. Play games to earn coins!`, 2600); return false; }
    if (r.error) return false;
    this.owned = r.owned;
    store.set('owned', this.owned);
    app.setWallet(r.wallet, { pulse: true });
    app.sfx.play('tada');
    haptic('success');
    app.ui.toast(`Bought ${entry.name}!`);
    return true;
  }

  setBackdrop(id) {
    const b = backdropById(id);
    if (b.price > 0 && !this.owned.includes(b.id)) return;
    this.app.setSetting('backdrop', id);
    this.applyBackdrop();
  }

  /** The current pet's outfit (cached: read every frame). */
  get outfit() {
    const pet = this.app.species.id;
    if (this.outfitCache?.pet !== pet) this.outfitCache = { pet, outfit: outfitFor(this.outfits, pet) };
    return this.outfitCache.outfit;
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
    if (name === 'play') {
      if (this.app.ball.active) this.app.toggleBall(); // tap again to put the ball away
      else this.playBar.toggle([{ id: 'ball', emoji: '⚽', name: 'Ball', label: 'Ball' }, ...GAMES.map((g) => ({ ...g, label: g.short }))]);
      return true;
    }
    if (name !== 'snack') return false;
    this.app.sfx.unlock();
    this.snackBar.toggle(this.snacks.menu.map((s) => ({ ...s, mark: s.favourite ? '♥' : '', markLabel: 'favourite' })));
    return true;
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
      owned: this.owned,
      coins: () => app.wallet.coins,
      onBuy: (entry) => this.buy(entry),
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
    this.outfits = wear(this.outfits, app.species.id, itemId, this.owned);
    this.outfitCache = null;
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
    let scene;
    try {
      scene = captureScene({
        canvases: [r.backCanvas, r.useGl ? r.glCanvas : null, r.canvas].filter(Boolean),
        center: r.toScreen(c.x, c.y),
        S: r.S,
        dpr: r.dpr,
        palette: app.species.palette,
        backdrop: this.backdropImg?.complete && this.backdropImg.naturalWidth > 0 && this.layout ? { img: this.backdropImg, ...this.layout } : null,
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
    const meta = { name: app.species.name, level: app.bond.level, accent: app.species.palette.accent, date: new Date() };
    const render = async (frameId) => toBlob(await framePhoto(scene, frameById(frameId), meta));
    const blob = await render('polaroid').catch(() => null);
    if (!blob) { app.ui.toast("Couldn't save the photo"); return; }
    this.lastPhoto = blob;
    const sheet = photoSheet({
      blob, render,
      fileName: photoFileName(app.species.name, meta.date),
      petName: app.species.name,
      frames: PHOTO_FRAMES.map((f) => ({ id: f.id, name: f.name, thumb: frameUrl(f) })),
    });
    app.ui.openSheet('photo', 'Snap!', sheet.el);
    app.sheetDispose = sheet.dispose;
  }
}
