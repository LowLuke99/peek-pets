// Owns the DOM chrome around the canvas: status chip, bond meter, speech bubble,
// facts chip, dock buttons, toast, debug HUD and the bottom sheet container.

import { $, h } from './dom.js';

export class UI {
  constructor(handlers) {
    this.handlers = handlers;
    this.chip = $('#statusChip');
    this.statusText = $('#statusText');
    this.fact = $('#factChip');
    this.bubble = $('#bubble');
    this.bondEl = $('#bond');
    this.bondFill = $('#bondFill');
    this.bondLevel = $('#bondLevel');
    this.hud = $('#hud');
    this.toastEl = $('#toast');
    this.dim = $('#dim');
    this.sheet = $('#sheet');
    this.sheetBody = $('#sheetBody');
    this.sheetTitle = $('#sheetTitle');
    this.scrim = $('#sheetScrim');
    this.sheetKind = null;
    this.bubbleTimer = null;
    this.toastTimer = null;

    for (const btn of document.querySelectorAll('.dock__btn')) {
      btn.addEventListener('click', () => handlers.onAction(btn.dataset.action, btn));
    }
    this.chip.addEventListener('click', () => handlers.onStatusTap());
    $('#settingsBtn').addEventListener('click', () => handlers.onOpen('settings'));
    $('#petBtn').addEventListener('click', () => handlers.onOpen('pets'));
    $('#powersBtn').addEventListener('click', () => handlers.onOpen('powers'));
    $('#sheetClose').addEventListener('click', () => this.closeSheet());
    this.scrim.addEventListener('click', () => this.closeSheet());
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.closeSheet(); });
  }

  setStatus(state, text) {
    this.chip.dataset.state = state;
    if (this.statusText.textContent !== text) this.statusText.textContent = text;
  }

  setFact(text) {
    this.fact.hidden = !text;
    if (text && this.fact.textContent !== text) this.fact.textContent = text;
  }

  setBond(progress, level, pulse) {
    this.bondFill.style.width = `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`;
    this.bondLevel.textContent = `Lv ${level}`;
    this.bondEl.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
    this.bondEl.setAttribute('aria-valuetext', `Level ${level}, ${Math.round(progress * 100)} percent to next`);
    if (pulse) {
      this.bondEl.classList.remove('is-pulse');
      void this.bondEl.offsetWidth;
      this.bondEl.classList.add('is-pulse');
      setTimeout(() => this.bondEl.classList.remove('is-pulse'), 260);
    }
  }

  setCoins(n) {
    const el = document.getElementById('coinCount');
    if (el && el.textContent !== String(n)) {
      el.textContent = String(n);
      el.parentElement?.classList.remove('is-pulse');
      void el.offsetWidth;
      el.parentElement?.classList.add('is-pulse');
    }
  }

  say(text, ms = 2400) {
    clearTimeout(this.bubbleTimer);
    this.bubble.textContent = text;
    this.bubble.hidden = false;
    this.bubble.classList.remove('is-out', 'is-in');
    void this.bubble.offsetWidth;
    this.bubble.classList.add('is-in');
    this.bubbleTimer = setTimeout(() => {
      this.bubble.classList.replace('is-in', 'is-out');
      this.bubbleTimer = setTimeout(() => { this.bubble.hidden = true; }, 260);
    }, ms);
  }

  get bubbleVisible() {
    return !this.bubble.hidden;
  }

  placeBubble(x, y) {
    const w = this.bubble.offsetWidth;
    const hgt = this.bubble.offsetHeight;
    const left = Math.min(window.innerWidth - w - 12, Math.max(12, x - w / 2));
    const top = Math.max(120, y - hgt - 14);
    this.bubble.style.translate = `${Math.round(left)}px ${Math.round(top)}px`;
  }

  setPressed(action, on) {
    document.querySelector(`.dock__btn[data-action="${action}"]`)?.setAttribute('aria-pressed', String(on));
  }

  flash(btn) {
    btn.classList.add('is-flash');
    setTimeout(() => btn.classList.remove('is-flash'), 600);
  }

  setDim(on) {
    this.dim.classList.toggle('is-on', on);
  }

  toast(text, ms = 2200) {
    clearTimeout(this.toastTimer);
    this.toastEl.textContent = text;
    this.toastEl.hidden = false;
    this.toastEl.style.animation = 'none';
    void this.toastEl.offsetWidth;
    this.toastEl.style.animation = '';
    this.toastTimer = setTimeout(() => { this.toastEl.hidden = true; }, ms);
  }

  /** Pixels from the bottom edge covered by the nudge card (0 if hidden). Also lifts toasts above it. */
  nudgeInset() {
    const el = document.getElementById('nudge');
    if (!el || el.hidden) return 0;
    const covered = Math.max(0, window.innerHeight - el.getBoundingClientRect().top);
    document.documentElement.style.setProperty('--nudge-cover', `${Math.round(covered)}px`);
    return covered;
  }

  setHud(text) {
    this.hud.hidden = text == null;
    if (text != null) this.hud.textContent = text;
  }

  openSheet(kind, title, body) {
    this.sheetKind = kind;
    this.sheetTitle.textContent = title;
    this.sheetBody.replaceChildren(body);
    this.sheet.classList.remove('is-closing');
    this.sheet.hidden = false;
    this.scrim.hidden = false;
    this.handlers.onSheet?.(kind);
  }

  replaceSheetBody(body) {
    if (this.sheetKind) this.sheetBody.replaceChildren(body);
  }

  closeSheet() {
    if (!this.sheetKind) return;
    const kind = this.sheetKind;
    this.sheetKind = null;
    this.sheet.classList.add('is-closing');
    this.scrim.hidden = true;
    setTimeout(() => { if (!this.sheetKind) this.sheet.hidden = true; }, 240);
    this.handlers.onSheetClosed?.(kind);
  }
}

export { h };
