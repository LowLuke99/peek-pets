// Snack time: a treat arcs up from the dock to the pet's mouth. The pet tracks it,
// opens wide ("aah"), then chomps and chews with crumbs and hearts. Favourites get
// extra joy, chili makes everyone but Ember steam, and a full pet shakes its head and
// the treat bounces away. Rules live in core/snacks.js; this is the show.

import { store } from '../store.js';
import { SNACKS, snackById, eatSnack, favouriteOf } from '../core/snacks.js';
import { pickLine } from '../behavior/lines.js';
import { haptic } from '../native.js';

const FLIGHT_S = 0.8;
const BOND = { favourite: 3, yum: 2, spicy: 1, full: 0 };

export class SnackTime {
  constructor(app) {
    this.app = app;
    this.treat = null;
    this.eaten = store.get('snacks') ?? {};
    this.found = store.get('snackFavs') ?? {}; // favourites you've discovered, per pet
  }

  get menu() {
    const pet = this.app.species.id;
    return SNACKS.map((s) => ({ ...s, favourite: this.found[pet] === s.id }));
  }

  get active() {
    return Boolean(this.treat);
  }

  /** Throws a treat to the pet. Returns false if one is already flying. */
  feed(snackId, from) {
    const snack = snackById(snackId);
    if (!snack || this.treat) return false;
    const app = this.app;
    const pet = app.species.id;
    const result = eatSnack(this.eaten[pet], pet, snackId, Date.now());
    if (result.outcome !== 'full') {
      this.eaten = { ...this.eaten, [pet]: result.eaten };
      store.set('snacks', this.eaten);
    }
    const start = app.renderer.toStage(from?.x ?? app.renderer.W / 2, from?.y ?? app.renderer.H - 60);
    this.treat = { snack, outcome: result.outcome, x: start.x, y: start.y, x0: start.x, y0: start.y, u: 0, spin: 0, cued: false, bounce: null };
    if (app.emotion === 'asleep' || app.mood.napping) app.react({ type: 'tap' });
    app.syncNapUi();
    app.sfx.play('swoosh');
    return true;
  }

  mouth() {
    const app = this.app;
    const pose = app.pose ?? { x: 0, y: 0, t: 0, hop: 0, calm: 1, energy: 0.5 };
    const c = app.renderer.bodyCenter(app.species, pose);
    const f = app.species.face;
    return { x: c.x, y: c.y + f.y + f.r * 1.5 };
  }

  /** Where the pet should look (stage units), or null. */
  lookPoint() {
    return this.treat ? { x: this.treat.x, y: this.treat.y } : null;
  }

  update(dt) {
    const t = this.treat;
    if (!t) return;
    if (t.bounce) return this.updateBounce(t, dt);
    t.u = Math.min(1, t.u + dt / FLIGHT_S);
    t.spin += dt * 7;
    const m = this.mouth();
    const e = 1 - (1 - t.u) ** 2; // ease out: fast throw, gentle catch
    t.x = t.x0 + (m.x - t.x0) * e;
    t.y = t.y0 + (m.y - t.y0) * e - Math.sin(Math.PI * t.u) * 0.55;
    if (!t.cued && t.u > 0.45) {
      t.cued = true;
      this.app.rig.perform(t.outcome === 'full' ? 'nope' : 'aah', t.outcome === 'full' ? undefined : FLIGHT_S * (1 - t.u) + 0.05);
      if (t.outcome === 'full') this.say('snackFull');
    }
    if (t.u >= 1) this.arrive(t, m);
  }

  arrive(t, m) {
    const app = this.app;
    if (t.outcome === 'full') {
      t.bounce = { vx: (Math.random() < 0.5 ? -1 : 1) * 1.3, vy: -1.6, age: 0 };
      app.sfx.play('bounce');
      return;
    }
    this.treat = null;
    app.rig.stopAct('aah');
    app.rig.perform('chew');
    app.rig.boop(0.4);
    app.particles.burst('crumb', m.x, m.y, 9, { speed: 0.9, spread: 2.6, angle: -Math.PI / 2 });
    haptic(t.outcome === 'favourite' ? 'success' : 'soft');
    app.sfx.play('pop');
    const top = app.headStage();
    if (t.outcome === 'spicy') {
      setTimeout(() => {
        app.rig.perform('shake');
        app.particles.burst('steam', top.x, top.y + 0.05, 6, { speed: 0.6, spread: 2.2 });
        app.sfx.play('surprise');
      }, 600);
      this.say('snackSpicy');
    } else {
      app.react({ type: 'double' });
      app.particles.burst('heart', top.x, top.y + 0.05, t.outcome === 'favourite' ? 6 : 3, { speed: 0.7, spread: 1.8 });
      setTimeout(() => app.sfx.play('giggle'), 500);
      if (t.outcome === 'favourite') {
        this.found = { ...this.found, [app.species.id]: favouriteOf(app.species.id) };
        store.set('snackFavs', this.found);
        app.particles.burst('sparkle', top.x, top.y + 0.1, 8, { speed: 1, spread: 3 });
      }
      this.say(t.outcome === 'favourite' ? 'snackFav' : 'snackYum', { snack: t.snack.name.toLowerCase() });
    }
    app.addBond(BOND[t.outcome] ?? 1);
    app.send('snack');
  }

  updateBounce(t, dt) {
    const b = t.bounce;
    b.age += dt;
    b.vy += 4 * dt;
    t.x += b.vx * dt;
    t.y += b.vy * dt;
    t.spin += dt * 10;
    if (b.age > 0.9) this.treat = null;
  }

  say(key, vars) {
    const line = pickLine(key, vars ?? {}, this.app.species);
    if (line) this.app.ui.say(line, 2600);
  }

  /** Drawn in stage space (after the pet), like the ball. */
  draw(ctx) {
    const t = this.treat;
    if (!t) return;
    const size = 0.17 * (t.bounce ? 1 : 0.8 + 0.2 * Math.sin(Math.PI * t.u));
    ctx.save();
    ctx.globalAlpha = t.bounce ? Math.max(0, 1 - t.bounce.age / 0.9) : 1;
    ctx.translate(t.x, t.y);
    ctx.rotate(Math.sin(t.spin) * 0.35);
    ctx.font = `${size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t.snack.emoji, 0, 0);
    ctx.restore();
  }
}
