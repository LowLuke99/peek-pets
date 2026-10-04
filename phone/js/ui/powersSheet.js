// The Powers ("labs") screen: every helpful power with its on/off switch, why it
// might not be running, and its controls when it is. Panels rebuild when the PC
// sends new state (unless you're typing in one); countdowns tick every second.

import { h, toggle } from './dom.js';
import { availability } from '../core/powers.js';
import { PANELS, tickCountdowns } from '../powers/panels.js';

const STATUS = {
  'needs-pc': 'Needs your PC connected',
  blocked: 'Turned off on the PC: allow it in the companion\'s Powers tab',
  off: 'Off',
  starting: 'Starting…',
  on: 'On',
};

/**
 * @param {{glue: import('../powers/glue.js').PowerGlue, focus?: string}} opts
 * @returns {{el: HTMLElement, dispose: () => void}}
 */
export function powersSheet({ glue, focus }) {
  const memo = {};
  const cards = new Map();
  const list = h('div', { class: 'powers' });
  const connected = () => glue.client.connected;
  const keys = () => (glue.client.state.list.length ? glue.client.state.list : Object.keys(PANELS));

  const allOn = h('button', { class: 'btn btn--ghost btn--small', type: 'button', text: 'Turn all on', onclick: () => {
    for (const k of keys()) if (glue.client.entry(k)?.allowed !== false) glue.client.setOn(k, true);
  } });

  function renderCard(key) {
    const panel = PANELS[key];
    const entry = glue.client.entry(key);
    if (!panel) return null;
    const status = availability(entry, connected());
    const ctx = {
      glue, memo: (memo[key] ??= {}),
      run: (power, name, args, label) => glue.run(power, name, args, label),
      rerender: () => replace(key),
    };
    const state = status === 'on' ? entry.state : null;
    const at = glue.client.state.at[key];
    const body = status === 'on'
      ? h('div', { class: 'power__body' }, panel.build(state, ctx, at), panel.extra?.(ctx))
      : null;
    return h('section', { class: `power power--${status}`, id: `power-${key}`, 'aria-labelledby': `power-${key}-title` },
      h('div', { class: 'power__head' },
        h('span', { class: 'power__icon', 'aria-hidden': 'true', text: panel.icon }),
        h('div', { class: 'power__titles' },
          h('b', { id: `power-${key}-title`, text: entry?.label ?? key }),
          h('small', { text: status === 'on' || status === 'off' ? panel.blurb : STATUS[status] })),
        toggle(Boolean(entry?.on), (v) => glue.client.setOn(key, v), `${entry?.label ?? key} on`)),
      body);
  }

  function replace(key) {
    const old = cards.get(key);
    if (old?.contains(document.activeElement) && document.activeElement.matches('input, textarea')) return; // don't wipe typing
    const fresh = renderCard(key);
    if (!fresh) return;
    const sw = fresh.querySelector('.switch');
    if (sw) sw.disabled = !connected() || glue.client.entry(key)?.allowed === false;
    if (old) old.replaceWith(fresh); else list.append(fresh);
    cards.set(key, fresh);
  }

  function renderAll() {
    for (const key of keys()) replace(key);
  }

  renderAll();
  const unsubscribe = glue.subscribe((key) => (key ? replace(key) : renderAll()));
  const ticker = setInterval(() => tickCountdowns(list), 1000);
  if (focus) requestAnimationFrame(() => cards.get(focus)?.scrollIntoView({ block: 'start', behavior: 'smooth' }));

  const el = h('div', {},
    h('p', { class: 'lead', text: 'Labs: little ways your pet can help on the PC. Try them all, keep what helps. Your PC\'s Labs scorecard counts which ones earn their place.' }),
    connected() ? h('div', { class: 'btn-row btn-row--end' }, allOn) : h('p', { class: 'error', text: 'Connect to your PC to use powers.' }),
    list,
    h('p', { class: 'lead lead--small', text: 'Powers only read what they need (never your screen or keystrokes). The first time you use a command, your PC asks you to allow it.' }));
  return { el, dispose: () => { unsubscribe(); clearInterval(ticker); } };
}
