// Two small surfaces for the helpful powers: the tray (live chips above the dock:
// focus countdown, the next timer, what's being watched, what's playing) and the
// nudge card (a gentle card with a couple of buttons, e.g. "Eye break 👀").

import { h } from './dom.js';
import { fmtClock } from '../core/powers.js';

const ICONS = { focus: '📖', timer: '⏰', watch: '⏳', music: '🎧' };

export class Tray {
  constructor(el, onTap) {
    this.el = el;
    this.onTap = onTap;
    this.chips = new Map();
  }

  render(items) {
    const keys = new Set(items.map((i) => i.key));
    for (const [key, chip] of this.chips) {
      if (!keys.has(key)) { chip.el.remove(); this.chips.delete(key); }
    }
    items.forEach((item, index) => {
      let chip = this.chips.get(item.key);
      if (!chip) {
        const text = h('span', { class: 'tray__text' });
        const sub = h('small', { class: 'tray__sub' });
        const el = h('button', { class: 'tray__chip', type: 'button', onclick: () => this.onTap(item.key) },
          h('i', { class: 'tray__icon', 'aria-hidden': 'true', text: ICONS[item.icon] ?? '•' }), text, sub);
        chip = { el, text, sub };
        this.chips.set(item.key, chip);
      }
      if (this.el.children[index] !== chip.el) this.el.insertBefore(chip.el, this.el.children[index] ?? null);
      if (chip.text.textContent !== item.text) chip.text.textContent = item.text;
      const subText = item.sub ?? '';
      if (chip.sub.textContent !== subText) chip.sub.textContent = subText;
      chip.sub.hidden = !subText;
      chip.el.style.setProperty('--p', String(Math.max(0, Math.min(1, item.progress ?? 0))));
      chip.el.classList.toggle('has-progress', item.progress != null);
      chip.el.setAttribute('aria-label', `${item.text}${subText ? `, ${subText}` : ''}. Open powers.`);
    });
    this.el.hidden = items.length === 0;
  }
}

export class NudgeCard {
  /** @param {(card: object, action: object) => void} onAction */
  constructor(el, onAction) {
    this.el = el;
    this.onAction = onAction;
    this.card = null;
    this.queue = [];
    this.shownAt = 0;
    this.countdownEnd = 0;
    this.ring = null;
  }

  get visible() {
    return Boolean(this.card);
  }

  /** Shows a card now, or queues it behind the one on screen (same id replaces). */
  show(card, now = Date.now()) {
    if (this.card && this.card.id !== card.id) {
      this.queue = [...this.queue.filter((c) => c.id !== card.id), card].slice(-4);
      return;
    }
    this.present(card, now);
  }

  present(card, now = Date.now()) {
    this.card = card;
    this.shownAt = now;
    this.countdownEnd = card.seconds ? now + card.seconds * 1000 : 0;
    this.ring = card.seconds ? h('b', { class: 'nudge__ring', text: String(card.seconds) }) : null;
    const items = card.items?.length ? h('ul', { class: 'nudge__items' }, card.items.map((i) => h('li', { text: i }))) : null;
    this.el.replaceChildren(...[
      h('div', { class: 'nudge__head' },
        h('div', {}, h('b', { class: 'nudge__title', text: card.title }), h('p', { class: 'nudge__body', text: card.body })),
        this.ring),
      items,
      h('div', { class: 'nudge__actions' }, card.actions.map((a, i) => h('button', {
        class: i === 0 ? 'nudge__btn nudge__btn--main' : 'nudge__btn', type: 'button', text: a.label,
        onclick: () => this.act(a),
      }))),
    ].filter(Boolean));
    this.el.hidden = false;
    this.el.classList.remove('is-in');
    void this.el.offsetWidth;
    this.el.classList.add('is-in');
  }

  act(action) {
    const card = this.card;
    if (!card) return;
    this.hide();
    this.onAction(card, action);
  }

  hide() {
    this.card = null;
    this.el.hidden = true;
    const next = this.queue.shift();
    if (next) setTimeout(() => { if (!this.card) this.present(next); }, 450);
  }

  /** Drops everything (e.g. the PC disconnected). */
  clear() {
    this.queue = [];
    this.hide();
  }

  /** Runs countdowns and expiry. Returns 'countdown-done' | 'expired' | null. */
  tick(now = Date.now()) {
    const card = this.card;
    if (!card) return null;
    if (this.countdownEnd) {
      const left = Math.max(0, Math.ceil((this.countdownEnd - now) / 1000));
      if (this.ring && this.ring.textContent !== String(left)) this.ring.textContent = left > 0 ? String(left) : '✓';
      if (left === 0) {
        this.countdownEnd = 0;
        return 'countdown-done';
      }
    }
    if (card.ttlMs && now - this.shownAt > card.ttlMs) {
      this.hide();
      return 'expired';
    }
    return null;
  }
}

export { fmtClock };
