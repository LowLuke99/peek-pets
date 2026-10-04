// The snack picker: a row of treats that pops up above the dock. Picking one throws
// it to the pet from that button. Favourites you've discovered get a little heart.

import { h, $ } from './dom.js';

export class SnackBar {
  constructor({ onPick, onToggle }) {
    this.el = $('#snackbar');
    this.onPick = onPick;
    this.onToggle = onToggle;
    this.open = false;
    document.addEventListener('pointerdown', (e) => {
      if (this.open && !this.el.contains(e.target) && !e.target.closest('[data-action="snack"]')) this.hide();
    });
  }

  show(menu) {
    this.el.replaceChildren(...menu.map((s) => h('button', {
      class: 'snack', type: 'button', 'data-snack': s.id,
      'aria-label': `${s.name}${s.favourite ? ' (favourite)' : ''}`,
      onclick: (e) => {
        const r = e.currentTarget.getBoundingClientRect();
        this.onPick(s.id, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
      },
    }, h('span', { class: 'snack__emoji', text: s.emoji, 'aria-hidden': 'true' }),
    s.favourite ? h('i', { class: 'snack__fav', text: '♥', 'aria-hidden': 'true' }) : null)));
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

  toggle(menu) {
    if (this.open) this.hide(); else this.show(menu);
  }
}
