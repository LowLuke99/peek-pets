// Runs the built-in mini-games: a HUD, a touch layer over the stage, the results card,
// best scores and bond rewards. Each game is a small controller with
// update(dt) / draw(ctx) / pointer(kind, stagePoint) and optional lookPoint(),
// applyToPose(pose), inset (px to lift the pet) and hud().

import { store } from '../store.js';
import { h, $ } from '../ui/dom.js';
import { haptic } from '../native.js';
import { CatchGame } from './catchGame.js';
import { CupsGame } from './cupsGame.js';
import { PopGame } from './popGame.js';

export const GAMES = Object.freeze([
  { id: 'catch', name: 'Treat Catch', short: 'Catch', emoji: '🍓', blurb: 'Slide to catch treats. Dodge the chilies!' },
  { id: 'cups', name: 'Cup Shuffle', short: 'Cups', emoji: '🥤', blurb: 'Find the treat. Your pet peeks… at first.' },
  { id: 'pop', name: 'Bubble Pop', short: 'Bubbles', emoji: '🫧', blurb: 'Pop the treat bubbles. Not the rain clouds!' },
]);

const MAKERS = { catch: (host) => new CatchGame(host), cups: (host) => new CupsGame(host), pop: (host) => new PopGame(host) };

export class GameHost {
  constructor(app) {
    this.app = app;
    this.game = null;
    this.best = store.get('gameBest') ?? {};
    this.layer = $('#gamelayer');
    this.hud = $('#gamehud');
    this.card = $('#gameover');
    $('#gameQuit')?.addEventListener('click', () => this.stop());
    const toStage = (e) => this.app.renderer.toStage(e.clientX, e.clientY);
    this.layer?.addEventListener('pointerdown', (e) => { this.layer.setPointerCapture?.(e.pointerId); this.game?.pointer('down', toStage(e)); });
    this.layer?.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') this.game?.pointer('move', toStage(e)); });
    this.layer?.addEventListener('pointerup', (e) => this.game?.pointer('up', toStage(e)));
  }

  get active() {
    return Boolean(this.game);
  }

  start(id) {
    const make = MAKERS[id];
    if (!make) return;
    const app = this.app;
    this.stop(true);
    app.ui.closeSheet();
    app.play?.snackBar.hide();
    app.ball.hide();
    app.ui.setPressed('play', false);
    if (app.mood.napping) app.action('nap');
    app.react({ type: 'play' });
    this.card.hidden = true;
    this.game = make(this);
    this.gameId = id;
    document.documentElement.classList.add('in-game');
    this.layer.hidden = false;
    this.hud.hidden = false;
    this.renderHud();
    app.send(`game-${id}`);
  }

  /** Ends the game; `quiet` skips the results card (e.g. switching games). */
  stop(quiet = false) {
    if (!this.game) return;
    this.game = null;
    document.documentElement.classList.remove('in-game');
    this.layer.hidden = true;
    this.hud.hidden = true;
    if (quiet) this.card.hidden = true;
  }

  // ---------------------------------------------------------------- hooks from the app
  frame(dt) {
    if (!this.game) return;
    this.game.update(dt);
    if ((this.hudTimer = (this.hudTimer ?? 0) + dt) > 0.1) { this.hudTimer = 0; this.renderHud(); }
  }

  draw(ctx) { this.game?.draw(ctx); }
  lookPoint() { return this.game?.lookPoint?.() ?? null; }
  applyToPose(pose) { return this.game?.applyToPose?.(pose) ?? pose; }
  get inset() { return this.game?.inset ?? 0; }
  get zoom() { return this.game?.zoom ?? 1; }

  renderHud() {
    const info = this.game?.hud?.();
    if (!info) return;
    $('#gameScore').textContent = info.score;
    $('#gameInfo').textContent = info.info;
  }

  /** Called by a game when the round is over: pays coins + XP, records the best, shows results. */
  finish(score, { unit = 'points' } = {}) {
    const app = this.app;
    const id = this.gameId;
    const game = GAMES.find((g) => g.id === id);
    const prev = this.best[id] ?? 0;
    const record = score > prev;
    if (record) {
      this.best = { ...this.best, [id]: score };
      store.set('gameBest', this.best);
    }
    this.stop();
    const earned = app.rewardGame(id, score);
    this.onFinished?.(id, score);
    const top = app.headStage();
    if (record && score > 0) {
      app.particles.burst('confetti', top.x, top.y, 28, { speed: 1.7, spread: 2.6 });
      app.sfx.play('tada');
      haptic('success');
      app.react({ type: 'cheer' });
    } else {
      app.react({ type: 'double' });
    }
    this.card.replaceChildren(
      h('p', { class: 'gameover__title', text: `${game?.emoji ?? '🎮'} ${game?.name ?? 'Game'}` }),
      h('p', { class: 'gameover__score', text: `${score} ${unit}` }),
      h('p', { class: 'gameover__best', text: record && score > 0 ? '🏆 New best!' : `Best: ${Math.max(prev, score)} ${unit}` }),
      h('p', { class: 'gameover__earned', text: `+${earned.coins} 🪙   +${earned.xp} XP${earned.daily ? '   (daily bonus!)' : ''}` }),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', text: 'Play again', 'data-game-again': id, onclick: () => this.start(id) }),
        h('button', { class: 'btn btn--ghost', type: 'button', text: 'Done', onclick: () => { this.card.hidden = true; } }),
      ),
    );
    this.card.hidden = false;
  }
}
