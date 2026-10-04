// App controller: wires the PC link, cursor tracking, mood, rig, touch, toys and UI,
// and runs the frame loop. Pure logic lives in core/; drawing in pet/ and fx/.

import { store, loadSettings, saveSettings } from './store.js';
import { $ } from './ui/dom.js';
import { UI } from './ui/ui.js';
import { pairSheet, pcSheet, settingsSheet, petsSheet } from './ui/sheets.js';
import { factChip } from './ui/format.js';
import { Previews } from './ui/previews.js';
import { Link } from './net/link.js';
import { pairCodeFromHash } from './core/protocol.js';
import { cursorToGaze, pointToGaze, predict } from './core/gaze.js';
import { CursorTracker, DemoCursor } from './core/cursor.js';
import { initialMood, moodReduce, moodTick, currentEmotion } from './core/mood.js';
import { addHearts, levelFor } from './core/bond.js';
import { clamp } from './core/spring.js';
import { PetRig } from './pet/rig.js';
import { Renderer } from './pet/renderer.js';
import { SPECIES, getSpecies } from './pet/species/index.js';
import { Particles } from './fx/particles.js';
import { Ball } from './fx/toys.js';
import { Sfx } from './fx/sfx.js';
import { pickLine } from './behavior/lines.js';
import { attachInput } from './input.js';
import { KeepAwake } from './awake.js';
import { PowerGlue } from './powers/glue.js';
import { powersSheet } from './ui/powersSheet.js';

export const VERSION = '0.2.0';
const BUBBLE_COOLDOWN_MS = 4500;
const IMPORTANT_BUBBLES = new Set(['connect', 'disconnect', 'pc-closed', 'levelup', 'say']);

export class App {
  constructor() {
    this.settings = loadSettings();
    this.renderer = new Renderer($('#stage'), { glCanvas: $('#glStage'), backCanvas: $('#stageBack') });
    this.rig = new PetRig();
    this.particles = new Particles();
    this.ball = new Ball();
    this.cursor = new CursorTracker();
    this.demo = new DemoCursor();
    this.sfx = new Sfx();
    this.awake = new KeepAwake();
    this.previews = new Previews();
    this.mood = initialMood(Date.now());
    this.bonds = store.get('bonds') ?? {};
    this.facts = {};
    this.aspect = 16 / 9;
    this.touchLook = null;
    this.heldBall = false;
    this.stroke = 0;
    this.lastBubbleAt = 0;
    this.seenBubbleAt = 0;
    this.disconnectedAt = null;
    this.lastCursorStim = 0;
    this.lastEventSent = {};
    this.timers = { zzz: 0, note: 0, sparkle: 0, status: 0, hud: 0 };
    this.fps = 60;
    this.slowFrames = 0;
    this.pose = null;
    this.emotion = 'neutral';
    this.servedByPc = location.protocol.startsWith('http');
    this.lastCursorMsg = null;

    this.ui = new UI({
      onAction: (a, btn) => this.action(a, btn),
      onStatusTap: () => this.openSheet(this.link.token ? 'pc' : 'pair'),
      onOpen: (kind) => this.openSheet(kind),
      onSheetClosed: (kind) => {
        if (kind === 'pets') this.previews.clear();
        this.sheetDispose?.();
        this.sheetDispose = null;
      },
    });
    this.link = new Link({
      store,
      onState: (s, prev, info) => this.onLinkState(s, prev, info),
      onCursor: (m, now) => this.onCursor(m, now),
      onMessage: (m) => this.onLinkMessage(m),
    });
    this.glue = new PowerGlue(this);
    this.setSpecies(this.settings.pet, { quiet: true });
    this.applySettings();
    this.wireInput();
    window.addEventListener('resize', () => this.renderer.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.renderer.resize(), 250));
  }

  start() {
    const code = pairCodeFromHash(location.hash);
    if (code) {
      history.replaceState(null, '', location.pathname + location.search);
      this.link.pairWithCode(code);
    } else {
      this.link.start();
      if (!this.link.canConnect && !this.settings.demo) setTimeout(() => this.maybeFirstRunPair(), 1400);
    }
    this.refreshStatus();
    this.lastTs = performance.now();
    requestAnimationFrame((ts) => this.frame(ts));
  }

  maybeFirstRunPair() {
    if (store.get('seenPair') || this.link.canConnect || this.ui.sheetKind) return;
    store.set('seenPair', true);
    this.openSheet('pair');
  }

  // ---------------------------------------------------------------- frame loop
  frame(ts) {
    requestAnimationFrame((t) => this.frame(t));
    // Battery: a sleeping pet with nothing moving only needs 30 fps.
    if (this.restful() && (this.frameCount = (this.frameCount ?? 0) + 1) % 2) return;
    const dt = clamp((ts - this.lastTs) / 1000, 0, 0.1);
    this.lastTs = ts;
    if (dt <= 0) return;
    const now = performance.now();
    const wall = Date.now();
    this.trackPerformance(dt);

    if (this.demoActive) this.feedCursor(this.demo.step(dt), now, true);
    this.cursor.decay(now);

    const ctx = this.moodContext(now);
    const before = this.mood;
    this.mood = moodTick(this.mood, ctx, wall);
    if (this.mood !== before) this.checkBubble();
    this.emotion = currentEmotion(this.mood, ctx, wall);

    const { target, source } = this.pickGaze(now);
    const pose = this.rig.update(dt, { emotion: this.emotion, gazeTarget: target, source, reducedMotion: this.settings.reducedMotion });
    this.pose = pose;
    this.speciesState = this.species.step(this.speciesState, pose, dt);

    this.updateBall(dt, pose);
    this.ambientParticles(dt, pose);
    this.particles.update(dt);
    const props = this.glue.frame(dt, wall);
    this.renderer.setInset(this.glue.card.visible ? this.ui.nudgeInset() : 0);
    this.renderer.tick(dt);
    this.renderer.draw(this.species, pose, this.speciesState, this.particles, this.ball, props);
    this.previews.update(dt, this.rig.gaze, this.emotion);

    if (this.ui.bubbleVisible) {
      const p = this.renderer.headTop(this.species, pose);
      this.ui.placeBubble(p.x, p.y);
    }
    this.timers.status += dt;
    if (this.timers.status > 1) { this.timers.status = 0; this.refreshStatus(); }
    if (this.settings.debug) this.updateHud(dt, now);
  }

  restful() {
    return this.emotion === 'asleep' && !this.particles.active && !this.ball.active && !this.ui.bubbleVisible && !this.glue.card.visible;
  }

  trackPerformance(dt) {
    this.fps = this.fps * 0.95 + (1 / dt) * 0.05;
    this.link.fps = this.fps;
    if (this.restful()) return; // 30 fps on purpose
    this.slowFrames = dt > 0.024 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 0.5);
    if (this.slowFrames <= 90) return;
    this.slowFrames = 0;
    if (this.renderer.degrade()) return;
    if (this.look === 'clay' && this.settings.look === 'auto') {
      // Still slow at the lowest resolution: the classic look is much cheaper.
      this.look = this.renderer.setLook('classic');
      this.ui.toast('Switched to the Classic look to stay smooth');
    }
  }

  moodContext(now) {
    return {
      link: this.link.state,
      disconnectedAt: this.disconnectedAt,
      batteryLow: Boolean(this.facts.battery?.available && this.facts.battery.percent <= 20 && !this.facts.battery.charging),
      cursorActive: this.cursor.isActive(now),
      cursorFast: this.cursor.isFast(now),
      hour: new Date().getHours(),
      pcIdleSec: this.facts.activity?.idleSec ?? 0,
      ...this.glue.moodContext(),
    };
  }

  pickGaze(now) {
    if (this.emotion === 'asleep') return { target: null, source: 'idle' };
    const face = this.faceScreen();
    if (this.touchLook) return { target: pointToGaze(this.touchLook.x, this.touchLook.y, face.x, face.y, this.renderer.S), source: 'touch' };
    if (this.ball.active && (this.ball.moving || this.heldBall)) {
      const b = this.renderer.toScreen(this.ball.x, this.ball.y);
      return { target: pointToGaze(b.x, b.y, face.x, face.y, this.renderer.S), source: 'toy' };
    }
    const c = this.cursor.current(now);
    if (c) {
      const lead = this.demoActive ? 0 : clamp((this.link.latency ?? 15) * 0.7, 0, 40);
      const p = predict(c, this.cursor.vel, lead);
      return { target: cursorToGaze(p, { mode: this.settings.gazeMode, screens: this.settings.screens, aspect: this.aspect }), source: 'cursor' };
    }
    return { target: null, source: 'idle' };
  }

  faceScreen() {
    const pose = this.pose ?? { x: 0, y: 0, t: 0, energy: 0.5, hop: 0, calm: 1 };
    const c = this.renderer.bodyCenter(this.species, pose);
    return this.renderer.toScreen(c.x, c.y + this.species.face.y);
  }

  get demoActive() {
    return this.settings.demo && this.link.state !== 'connected';
  }

  // ---------------------------------------------------------------- PC link
  onLinkState(state, prev, info) {
    if (state === 'connected' && prev !== 'connected') {
      this.disconnectedAt = null;
      this.facts = info.facts ?? {};
      this.react({ type: 'connect' });
      this.sfx.play('hello');
      if (info.newlyPaired) this.ui.toast(`Paired with ${info.pc}!`);
      if (this.ui.sheetKind === 'pair') this.ui.closeSheet();
      this.rig.hopUp(0.7);
      this.onConnected?.();
    }
    if (prev === 'connected' && state !== 'connected') {
      this.disconnectedAt = Date.now();
      this.cursor.reset();
      this.glue.disconnected();
      this.react({ type: 'disconnect', closed: Boolean(info.closed) });
      this.sfx.play('bye');
    }
    if (state === 'unpaired' && info.authError) this.openSheet('pair');
    this.refreshStatus();
    if (this.ui.sheetKind === 'pc') this.openSheet('pc');
  }

  onCursor(m, now) {
    this.lastCursorMsg = m;
    this.feedCursor(m, now, false);
  }

  feedCursor(c, now, isDemo) {
    for (const g of this.cursor.push(c, now, this.aspect)) {
      if (g === 'burst') {
        this.react({ type: 'cursor-burst' });
        const top = this.headStage();
        this.particles.emit('bang', top.x, top.y - 0.05, { speed: 0 });
      } else if (g === 'spin') {
        this.react({ type: 'cursor-spin' });
        this.sfx.play('dizzy');
      }
    }
    const wall = Date.now();
    if (!isDemo && wall - this.lastCursorStim > 400) {
      this.lastCursorStim = wall;
      this.react({ type: 'cursor' });
    }
  }

  onLinkMessage(m) {
    if (this.glue.handle(m)) return;
    switch (m.t) {
      case 'click':
        if (this.emotion !== 'asleep' && Math.random() < 0.55) {
          this.rig.blinkNow();
          this.rig.boop(0.18);
        }
        break;
      case 'fact': this.onFact(m.key, m.value); break;
      case 'sharing': this.facts = { ...this.facts, ...m.facts }; break;
      case 'screens':
        if (m.virt?.w > 0 && m.virt?.h > 0) this.aspect = m.virt.w / m.virt.h;
        break;
      case 'say':
        this.react({ type: 'say' });
        this.ui.say(m.text, 3200);
        this.sfx.play('pop');
        this.rig.hopUp(0.4);
        break;
      default: break;
    }
  }

  onFact(key, value) {
    const prev = this.facts[key];
    this.facts = { ...this.facts, [key]: value };
    if (key === 'battery' && value.available && value.charging && prev?.available && !prev.charging) this.react({ type: 'charging' });
    if (key === 'activity' && (prev?.idleSec ?? 0) >= 300 && (value.idleSec ?? 0) < 30) this.react({ type: 'pc-back' });
    if (key === 'load' && value.cpu >= 90 && Date.now() - (this.lastBusy ?? 0) > 120_000) {
      this.lastBusy = Date.now();
      const top = this.headStage();
      this.particles.emit('drop', top.x + 0.22, top.y + 0.1, { speed: 0.1, angle: Math.PI / 2 });
      this.showLine('busy');
    }
    if (this.ui.sheetKind === 'pc') this.openSheet('pc');
  }

  refreshStatus() {
    const s = this.link.state;
    const pc = this.link.info.pc ?? store.get('pc') ?? 'PC';
    let state = 'solo', text = this.link.token ? 'PC offline' : 'Solo · tap to pair';
    if (s === 'connected') { state = 'connected'; text = `Linked to ${pc}${this.link.rtt != null ? ` · ${Math.round(this.link.rtt)} ms` : ''}`; }
    else if (s === 'connecting') { state = 'connecting'; text = 'Connecting to PC…'; }
    else if (s === 'reconnecting') {
      state = 'reconnecting';
      text = this.link.info.closedByPc ? 'PC app closed · waiting' : `${pc} away · reconnecting`;
    }
    if (this.demoActive && s !== 'connected') { state = 'demo'; text = `Demo cursor${s === 'reconnecting' ? ' · PC away' : ''}`; }
    this.ui.setStatus(state, text);
    this.ui.setFact(s === 'connected' ? factChip(this.facts) : null);
    this.renderer.canvas.setAttribute('aria-label', `${this.species.name} looks ${describeEmotion(this.emotion)}. ${text}.`);
  }

  // ---------------------------------------------------------------- reactions
  react(event) {
    this.mood = moodReduce(this.mood, event, Date.now());
    this.checkBubble();
  }

  checkBubble() {
    const b = this.mood.bubble;
    if (!b || b.at === this.seenBubbleAt) return;
    this.seenBubbleAt = b.at;
    this.showLine(b.key);
  }

  showLine(key, vars = {}) {
    const now = Date.now();
    if (!IMPORTANT_BUBBLES.has(key) && now - this.lastBubbleAt < BUBBLE_COOLDOWN_MS) return;
    if (key === 'sleep') { this.sfx.play('yawn'); return; }
    const line = pickLine(key, { pc: this.link.info.pc ?? 'PC', level: this.bond.level, ...vars }, this.species);
    if (!line) return;
    this.lastBubbleAt = now;
    this.ui.say(line);
  }

  headStage() {
    const pose = this.pose ?? { x: 0, y: 0, t: 0, energy: 0.5, hop: 0, calm: 1 };
    const c = this.renderer.bodyCenter(this.species, pose);
    return { x: c.x, y: c.y - this.species.hit.ry };
  }

  get bond() {
    return this.bonds[this.species.id] ?? { hearts: 0, level: 1 };
  }

  addBond(amount) {
    const next = addHearts(this.bond, amount);
    this.bonds = { ...this.bonds, [this.species.id]: { hearts: next.hearts, level: next.level } };
    clearTimeout(this.bondSave);
    this.bondSave = setTimeout(() => store.set('bonds', this.bonds), 800);
    this.ui.setBond(levelFor(next.hearts).progress, next.level, amount >= 1);
    if (next.leveledUp) {
      this.showLine('levelup', { level: next.level });
      this.sfx.play('level');
      const top = this.headStage();
      this.particles.burst('confetti', top.x, top.y, 26, { speed: 1.6, spread: 2.4 });
      this.rig.hopUp(1);
    }
  }

  action(name, btn) {
    this.sfx.unlock();
    const top = this.headStage();
    switch (name) {
      case 'play':
        if (this.ball.active) { this.ball.hide(); this.ui.setPressed('play', false); break; }
        this.ball.spawn(this.renderer.bounds);
        this.ui.setPressed('play', true);
        this.react({ type: 'play' });
        this.send('play');
        break;
      case 'cheer':
        this.ui.flash(btn);
        this.react({ type: 'cheer' });
        this.rig.hopUp(1);
        setTimeout(() => this.rig.hopUp(0.8), 520);
        this.particles.burst('confetti', top.x, top.y, 22, { speed: 1.5, spread: 2.2 });
        this.particles.burst('sparkle', top.x, top.y + 0.1, 6, { speed: 0.9, spread: 3 });
        this.sfx.play('giggle');
        this.addBond(2);
        this.send('cheer');
        break;
      case 'dance':
        this.ui.flash(btn);
        if (this.rig.dancing) { this.rig.stopDance(); break; }
        this.rig.startDance(7000, 112);
        this.react({ type: 'dance', ms: 7000 });
        this.sfx.play('dance');
        this.addBond(2);
        this.send('dance');
        break;
      case 'nap': {
        const on = !this.mood.napping;
        this.react({ type: 'nap', on });
        this.ui.setPressed('nap', on);
        this.ui.setDim(on);
        if (on) { this.sfx.play('yawn'); this.ball.hide(); this.ui.setPressed('play', false); this.send('sleep'); }
        break;
      }
      default: break;
    }
  }

  send(eventName) {
    const now = Date.now();
    if (now - (this.lastEventSent[eventName] ?? 0) < 1500) return;
    this.lastEventSent[eventName] = now;
    this.link.sendEvent(eventName);
  }

  syncNapUi() {
    if (!this.mood.napping) { this.ui.setPressed('nap', false); this.ui.setDim(false); }
  }

  // ---------------------------------------------------------------- touch
  wireInput() {
    const toStage = (x, y) => this.renderer.toStage(x, y);
    attachInput(this.renderer.canvas, {
      hitTest: (x, y) => (this.pose ? this.renderer.hitTest(this.species, this.pose, x, y) : null),
      ballAt: (x, y) => this.ball.contains(toStage(x, y)),
      onAnyTouch: () => {
        this.sfx.unlock();
        if (this.settings.awake) this.awake.enable();
      },
      onTap: (hit) => this.onTap(hit),
      onDoubleTap: (hit) => {
        if (!hit) return;
        this.react({ type: 'double' });
        this.rig.hopUp(1.1);
        const top = this.headStage();
        this.particles.burst('sparkle', top.x, top.y + 0.1, 7, { speed: 1, spread: 3 });
        this.sfx.play('giggle');
        this.addBond(1);
        this.syncNapUi();
      },
      onLongPress: () => {
        this.react({ type: 'hug' });
        this.rig.boop(0.5);
        const top = this.headStage();
        this.particles.burst('heart', top.x, top.y + 0.05, 5, { speed: 0.7, spread: 1.8 });
        this.sfx.play('pop');
        this.addBond(3);
        this.send('hug');
        this.syncNapUi();
      },
      onStroke: (seg) => this.onStroke(seg),
      onLook: (x, y) => {
        this.touchLook = { x, y };
        const wall = Date.now();
        if (wall - this.lastCursorStim > 600) { this.lastCursorStim = wall; this.react({ type: 'touch' }); this.syncNapUi(); }
      },
      onLookEnd: () => { this.touchLook = null; },
      onBallDrag: (x, y) => { this.heldBall = true; this.ball.hold(toStage(x, y)); },
      onBallRelease: (vx, vy) => {
        this.heldBall = false;
        this.ball.fling(vx / this.renderer.S, vy / this.renderer.S);
      },
    });
  }

  onTap(hit) {
    if (!hit) return;
    const top = this.headStage();
    if (hit.part === 'eye') {
      this.rig.winkEye(hit.side);
      this.react({ type: 'poke-eye' });
      this.particles.emit('bang', top.x + (hit.side === 'L' ? -0.2 : 0.2), top.y + 0.02, { speed: 0 });
      this.sfx.play('ouch');
    } else {
      this.rig.boop(1);
      this.react({ type: 'tap' });
      this.sfx.play(this.emotion === 'happy' ? 'giggle' : 'boop');
      if (Math.random() < 0.6) this.particles.emit('heart', top.x + (Math.random() - 0.5) * 0.3, top.y + 0.05, { speed: 0.6 });
      this.send('boop');
    }
    this.addBond(1);
    this.syncNapUi();
  }

  onStroke(seg) {
    this.stroke += seg;
    this.rig.petting();
    if (this.stroke < 70) return;
    this.stroke = 0;
    this.react({ type: 'pet' });
    const top = this.headStage();
    this.particles.emit('heart', top.x + (Math.random() - 0.5) * 0.4, top.y + 0.08, { speed: 0.55 });
    if (Math.random() < 0.3) this.sfx.play('pop');
    this.addBond(0.5);
    this.send('pet');
    this.syncNapUi();
  }

  // ---------------------------------------------------------------- toys + fx
  updateBall(dt, pose) {
    if (!this.ball.active) return;
    const c = this.renderer.bodyCenter(this.species, pose);
    const R = (this.species.hit.rx + this.species.hit.ry) / 2 * 0.92;
    for (const e of this.ball.update(dt, this.renderer.bounds, { cx: c.x, cy: c.y + this.species.hit.cy, R }, this.heldBall)) {
      if (e === 'hit-pet') {
        this.rig.boop(0.55);
        this.react({ type: 'ball-hit' });
        this.particles.burst('sparkle', this.ball.x, this.ball.y, 4, { speed: 0.8, spread: 3 });
        this.sfx.play('kick');
        this.addBond(0.5);
      } else if (e === 'kick') {
        this.rig.hopUp(0.6);
        this.sfx.play('kick');
      } else if (e === 'bounce') {
        this.sfx.play('bounce');
      }
    }
  }

  ambientParticles(dt, pose) {
    const t = this.timers;
    const top = this.headStage();
    if (this.emotion === 'asleep' && (t.zzz += dt) > 1.5) {
      t.zzz = 0;
      this.particles.emit('zzz', top.x + 0.22, top.y + 0.05, { speed: 0.18, angle: -Math.PI / 2 + 0.5, spread: 0.3 });
    }
    if (pose.dancing && (t.note += dt) > 0.42) {
      t.note = 0;
      this.particles.emit('note', top.x + (Math.random() - 0.5) * 0.7, top.y + 0.1, { speed: 0.5 });
    }
    if ((this.emotion === 'joy' || this.emotion === 'love') && (t.sparkle += dt) > 0.55) {
      t.sparkle = 0;
      this.particles.emit(this.emotion === 'love' ? 'heart' : 'sparkle', top.x + (Math.random() - 0.5) * 0.8, top.y + 0.15, { speed: 0.4 });
    }
    this.species.ambient?.(this.particles, pose, dt, this.renderer.bodyCenter(this.species, pose));
  }

  updateHud(dt, now) {
    this.timers.hud += dt;
    if (this.timers.hud < 0.25) return;
    this.timers.hud = 0;
    const l = this.link;
    const g = this.rig.gaze;
    const c = this.cursor.latest;
    this.ui.setHud([
      `link     ${l.state}`,
      `rtt      ${fmt(l.rtt)} ms`,
      `cursor   ${Math.round(l.cursorRate)}/s  ~${fmt(l.latency)} ms`,
      `last     ${c ? `${c.x.toFixed(3)}, ${c.y.toFixed(3)}` : '–'}`,
      `fps      ${Math.round(this.fps)}  dpr ${this.renderer.dpr.toFixed(1)}`,
      `look     ${this.look}${this.look === 'clay' ? ` · ${this.renderer.partsDrawn} parts` : ''}`,
      `mood     ${this.emotion}`,
      `gaze     ${g.x.toFixed(2)}, ${g.y.toFixed(2)}`,
      `awake    ${this.settings.awake ? this.awake.method : 'off'}`,
    ].join('\n'));
  }

  // ---------------------------------------------------------------- species + settings
  setSpecies(id, { quiet = false } = {}) {
    this.species = getSpecies(id);
    this.speciesState = this.species.init();
    const p = this.species.palette;
    const root = document.documentElement.style;
    root.setProperty('--bg-a', p.bgA);
    root.setProperty('--bg-b', p.bgB);
    root.setProperty('--accent', p.accent);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', p.bgA);
    this.previews.replaceAvatar($('#avatarCanvas'), this.species);
    const b = this.bond;
    this.ui.setBond(levelFor(b.hearts).progress, levelFor(b.hearts).level, false);
    if (!quiet) {
      this.rig.hopUp(0.9);
      this.react({ type: 'touch' });
      this.ui.say(pickLine('hello', {}, this.species) ?? 'Hi!');
      this.sfx.play('hello');
    }
  }

  setSetting(key, value) {
    this.settings = { ...this.settings, [key]: value };
    saveSettings(this.settings);
    this.applySettings();
    if (key === 'demo' && !value) this.cursor.reset();
    if (key === 'awake') { if (value) this.awake.enable(); else this.awake.disable(); }
  }

  applySettings() {
    this.sfx.enabled = this.settings.sound;
    this.look = this.renderer.setLook(this.settings.look);
    document.documentElement.classList.toggle('reduced-motion', this.settings.reducedMotion);
    if (!this.settings.debug) this.ui.setHud(null);
    this.refreshStatus();
  }

  openSheet(kind, focus) {
    this.sheetDispose?.();
    this.sheetDispose = null;
    if (kind === 'powers') {
      const sheet = powersSheet({ glue: this.glue, focus });
      this.ui.openSheet('powers', 'Powers', sheet.el);
      this.sheetDispose = sheet.dispose;
      return;
    }
    if (kind === 'pair') {
      this.ui.openSheet('pair', 'Pair with your PC', pairSheet({
        error: this.link.info.authError,
        servedByPc: this.servedByPc,
        onPair: (code) => { this.link.pairWithCode(code); this.ui.toast('Pairing…'); },
        onDemo: () => { this.setSetting('demo', true); this.ui.closeSheet(); this.ui.toast('Demo cursor on. Pair any time from Settings.'); },
      }));
    } else if (kind === 'pc') {
      if (!this.link.token && this.link.state !== 'connected') return this.openSheet('pair');
      this.ui.openSheet('pc', this.link.info.pc ?? store.get('pc') ?? 'Your PC', pcSheet({
        state: this.link.state, info: this.link.info, link: this.link,
        onRetry: () => { this.link.retryNow(); this.ui.toast('Reconnecting…'); },
        onForget: () => { this.link.forget(); this.ui.closeSheet(); this.ui.toast('Forgot this PC'); },
      }));
    } else if (kind === 'settings') {
      const pc = this.link.info.pc ?? store.get('pc');
      this.ui.openSheet('settings', 'Settings', settingsSheet({
        settings: this.settings,
        version: VERSION,
        pcLabel: pc ? `Paired with ${pc}` : 'No PC paired',
        onSetting: (k, v) => this.setSetting(k, v),
        onPairTap: () => this.openSheet(this.link.token ? 'pc' : 'pair'),
      }));
    } else if (kind === 'pets') {
      this.previews.clear();
      this.ui.openSheet('pets', 'Your pets', petsSheet({
        species: SPECIES,
        current: this.species.id,
        bonds: this.bonds,
        onPick: (id) => {
          this.settings = { ...this.settings, pet: id };
          saveSettings(this.settings);
          this.ui.closeSheet();
          this.setSpecies(id);
        },
        mountPreview: (canvas, s) => this.previews.mount(canvas, s),
      }));
    }
  }
}

const fmt = (v) => (v == null ? '–' : Math.round(v));

function describeEmotion(e) {
  return {
    neutral: 'calm', curious: 'curious', focused: 'focused', happy: 'happy', joy: 'overjoyed', love: 'loved',
    surprised: 'surprised', sleepy: 'sleepy', asleep: 'asleep', waiting: 'like it is waiting for your PC',
    worried: 'a little worried', dizzy: 'dizzy', wince: 'startled', proud: 'proud',
  }[e] ?? e;
}
