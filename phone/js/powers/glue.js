// The pet is the interface: turns power events from the PC into pet behaviour
// (poses, props, expressions, bubbles, sounds, haptics) plus the tray and nudge card.

import { PowersClient, reasonText } from './client.js';
import { petCues, trayItems, nudgeCard, powerLine, live, remaining } from '../core/powers.js';
import { Tray, NudgeCard } from '../ui/tray.js';
import { haptic, notify } from '../native.js';
import { $ } from '../ui/dom.js';

const TRAY_EVERY_S = 0.5;
const YAWN_EVERY_S = [45, 75];

export class PowerGlue {
  constructor(app) {
    this.app = app;
    this.client = new PowersClient({
      link: app.link,
      onChange: (key) => this.onChange(key),
      onEvent: (key, ev, data) => this.onEvent(key, ev, data),
      onPending: (label) => app.ui.toast(`Allow it on your PC: "${label}"`, 4000),
    });
    this.tray = new Tray($('#tray'), (key) => app.openSheet('powers', key));
    this.card = new NudgeCard($('#nudge'), (card, action) => this.onCardAction(card, action));
    this.cues = petCues(this.client.state, Date.now());
    this.trayTimer = 0;
    this.nextYawn = 30;
    this.waterUntil = 0;
    this.alarmUntil = 0;
    this.listeners = new Set();
  }

  /** Something on the Powers screen wants to know when power state changes. */
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onChange(key) {
    this.cues = petCues(this.client.state, Date.now());
    for (const fn of this.listeners) fn(key);
  }

  handle(m) {
    return this.client.handle(m);
  }

  disconnected() {
    this.client.disconnected();
    this.card.clear();
  }

  /** Runs a command with friendly feedback. */
  async run(power, name, args = {}, label = name) {
    const result = await this.client.run(power, name, args, label);
    if (!result.ok) this.app.ui.toast(reasonText(result.reason), 2600);
    return result;
  }

  // ---------------------------------------------------------------- events → pet
  onEvent(key, ev, data) {
    const app = this.app;
    const top = app.headStage();
    const line = powerLine(key, ev, data);
    if (line) app.ui.say(line, 3200);
    const card = nudgeCard(key, ev, data);
    if (card) this.card.show(card);

    switch (`${key}.${ev}`) {
      case 'breaks.nudge':
        app.react({ type: 'nudge' });
        app.sfx.play('nudge');
        haptic('soft');
        if (data.kind === 'eyes') app.rig.perform('lookFar', 22);
        else if (data.kind === 'stretch') app.rig.perform('stretch', 3.2);
        else if (data.kind === 'water') this.waterUntil = Date.now() + 15_000;
        break;
      case 'breaks.break_done':
        if ((data.minutes ?? 0) >= 3) this.celebrate(top, 'giggle', 10);
        break;
      case 'breaks.tired':
        if (data.level >= 2) app.rig.perform('yawn');
        break;
      case 'focus.started':
        app.rig.hopUp(0.5);
        app.sfx.play('pop');
        break;
      case 'focus.done':
        this.celebrate(top, 'tada', 26);
        haptic('success');
        notify('Focus session done 🎉', 'Time for a little break.');
        break;
      case 'media.playing':
        app.rig.hopUp(0.4);
        app.particles.burst('note', top.x, top.y + 0.05, 3, { speed: 0.5, spread: 2 });
        break;
      case 'watch.watching':
        app.rig.perform('point', 2.2);
        break;
      case 'watch.done':
        if (data.reason !== 'nothing') {
          this.celebrate(top, 'chime', 22);
          haptic('success');
          notify(`${data.label ?? 'It'} is done ✅`, data.text ?? 'Finished.');
        }
        break;
      case 'health.alert':
        app.react({ type: 'worry' });
        app.sfx.play('nudge');
        app.particles.emit('drop', top.x + 0.22, top.y + 0.1, { speed: 0.1, angle: Math.PI / 2 });
        haptic('warning');
        break;
      case 'handoff.received':
        app.sfx.play('swoosh');
        app.particles.burst('sparkle', top.x, top.y, 6, { speed: 1, spread: 2.5 });
        break;
      case 'quick.locking':
        app.rig.perform('wave');
        app.sfx.play('bye');
        break;
      case 'timers.done':
        app.react({ type: 'alert' });
        app.rig.perform('shake');
        app.sfx.play('alarm');
        this.alarmUntil = Date.now() + 3500;
        haptic('alarm');
        notify(`⏰ ${data.label ?? 'Timer'}`, 'Time\'s up!');
        break;
      case 'away.summary':
        app.react({ type: 'pc-back' });
        app.rig.perform('wave');
        app.sfx.play('hello');
        break;
      default:
        break;
    }
  }

  celebrate(top, sound, confetti) {
    const app = this.app;
    app.react({ type: 'celebrate' });
    app.rig.hopUp(1);
    setTimeout(() => app.rig.hopUp(0.7), 520);
    app.particles.burst('confetti', top.x, top.y, confetti, { speed: 1.5, spread: 2.2 });
    app.sfx.play(sound);
    app.addBond(1);
  }

  onCardAction(card, action) {
    if (action.ack) this.client.ack(card.key, action.ack, card.kind);
    if (action.cmd) this.run(action.cmd.power, action.cmd.name, action.cmd.args ?? {}, action.label);
    if (card.key === 'breaks' && action.ack === 'done') {
      this.app.rig.stopAct('lookFar');
      this.celebrate(this.app.headStage(), 'giggle', 8);
    }
    if (card.key === 'breaks' && action.ack !== 'done') this.app.rig.stopAct('lookFar');
    if (action.cmd?.name === 'space_hints') this.app.openSheet('powers', 'health');
  }

  // ---------------------------------------------------------------- per frame
  /** Props + info for the renderer, and keeps the rig's music bop in sync. */
  frame(dt, now) {
    const base = petCues(this.client.state, now);
    // Keep the ringing timer in its hand for a moment after it's gone from the list.
    const cues = now < this.alarmUntil && !base.hand ? { ...base, hand: 'timer' } : base;
    this.cues = cues;
    this.app.rig.bop = cues.bop;

    this.trayTimer += dt;
    if (this.trayTimer >= TRAY_EVERY_S) {
      this.trayTimer = 0;
      this.tray.render(this.client.connected ? trayItems(this.client.state, now) : []);
      const t = this.card.tick(now);
      if (t === 'countdown-done' && this.card.card?.key === 'breaks') {
        this.card.act(this.card.card.actions[0]); // the 20 seconds are up: that's a done eye break
      } else if (t === 'expired') {
        this.app.rig.stopAct('lookFar');
      }
    }

    if (cues.tired >= 2 && this.app.emotion !== 'asleep') {
      this.nextYawn -= dt;
      if (this.nextYawn <= 0) {
        this.app.rig.perform('yawn');
        this.app.sfx.play('yawn');
        this.nextYawn = YAWN_EVERY_S[0] + Math.random() * (YAWN_EVERY_S[1] - YAWN_EVERY_S[0]);
      }
    }

    const timers = live(this.client.state, 'timers')?.timers ?? [];
    const soonest = timers.reduce((a, t) => (!a || t.leftSec < a.leftSec ? t : a), null);
    const focus = live(this.client.state, 'focus');
    return {
      cues,
      info: {
        timerProgress: now < this.alarmUntil ? 1 : soonest ? 1 - remaining(soonest.leftSec, this.client.state.at.timers, now) / Math.max(1, soonest.totalSec) : 0,
        alarm: now < this.alarmUntil,
        water: now < this.waterUntil,
        focusProgress: focus?.running ? 1 - remaining(focus.leftSec, this.client.state.at.focus, now) / Math.max(1, focus.totalSec) : 0,
      },
    };
  }

  /** Extra mood context from the powers. */
  moodContext() {
    return { focusing: this.cues.focusing, tired: this.cues.tired };
  }
}
