// A row of round choices that pops up above the dock (the snack menu, the games menu).
// Picking one calls onPick(id, centreOfButton). Tapping outside closes it.

import { h, $ } from './dom.js';

export class ChoiceBar {
  /** @param {{el: string, action: string, label: string, onPick: Function, onToggle?: Function}} o */
  constructor({ el, action, onPick, onToggle }) {
    this.el = $(el);
    this.action = action;
    this.onPick = onPick;
    this.onToggle = onToggle;
    this.open = false;
    document.addEventListener('pointerdown', (e) => {
      if (this.open && !this.el.contains(e.target) && !e.target.closest(`[data-action="${action}"]`)) this.hide();
    });
  }

  /** @param {{id: string, emoji: string, name: string, mark?: string, label?: string}[]} items */
  show(items) {
    this.el.replaceChildren(...items.map((s) => h('button', {
      class: `snack${s.label ? ' snack--labelled' : ''}`, type: 'button', 'data-choice': s.id,
      'aria-label': `${s.name}${s.mark ? ` (${s.markLabel ?? s.mark})` : ''}`,
      onclick: (e) => {
        const r = e.currentTarget.getBoundingClientRect();
        this.onPick(s.id, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
      },
    }, h('span', { class: 'snack__emoji', text: s.emoji, 'aria-hidden': 'true' }),
    s.label ? h('small', { class: 'snack__label', text: s.label, 'aria-hidden': 'true' }) : null,
    s.mark ? h('i', { class: 'snack__fav', text: s.mark, 'aria-hidden': 'true' }) : null)));
    this.el.hidden = false;
    this.open = true;
    this.onToggle?.(true);
  }

  hide() {
    if (!this.open) return;
    this.el.hidden = true;
    this.open = false;
    this.onToggle?.(false);
  }

  toggle(items) {
    if (this.open) this.hide(); else this.show(items);
  }
}
