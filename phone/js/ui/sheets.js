// Bottom-sheet contents: pairing, PC details, settings, and the pet picker.

import { h, row, toggle, segmented } from './dom.js';
import { factText, ms } from './format.js';
import { normalizeCode } from '../core/protocol.js';

export function pairSheet({ error, onPair, onDemo, servedByPc }) {
  const input = h('input', {
    class: 'code-input', inputmode: 'text', autocomplete: 'one-time-code', autocapitalize: 'characters',
    spellcheck: 'false', maxlength: '7', placeholder: 'ABC-123', 'aria-label': 'Pairing code',
    oninput: (e) => { e.target.value = formatCode(e.target.value); },
    onkeydown: (e) => { if (e.key === 'Enter') submit(); },
  });
  const submit = () => {
    const code = normalizeCode(input.value);
    if (code.length === 6) onPair(code);
    else input.focus();
  };
  return h('div', {},
    h('p', { class: 'lead', text: servedByPc
      ? 'Open Peek Pets Companion on your PC, then scan its QR code with the iPhone Camera, or type the code it shows.'
      : 'Open this page from the address shown in Peek Pets Companion on your PC (same Wi-Fi), then pair.' }),
    servedByPc ? input : null,
    error ? h('p', { class: 'error', role: 'alert', text: error }) : null,
    h('div', { class: 'btn-row' },
      servedByPc ? h('button', { class: 'btn', type: 'button', text: 'Pair', onclick: submit }) : null,
      h('button', { class: 'btn btn--ghost', type: 'button', text: 'Play solo (demo)', onclick: onDemo }),
    ),
  );
}

function formatCode(v) {
  const c = normalizeCode(v);
  return c.length > 3 ? `${c.slice(0, 3)}-${c.slice(3)}` : c;
}

export function pcSheet({ state, info, link, onRetry, onForget }) {
  const facts = info.facts ?? {};
  const shared = info.shared ?? {};
  const catalog = info.catalog?.length ? info.catalog : [
    { key: 'battery', label: 'Battery' }, { key: 'activity', label: 'Away from PC' }, { key: 'load', label: 'CPU & memory load' },
  ];
  const statusText = state === 'connected' ? 'Connected'
    : state === 'reconnecting' ? `Reconnecting${info.retryAt ? ` in ${Math.max(0, Math.round((info.retryAt - Date.now()) / 1000))}s` : '…'}`
      : state === 'connecting' ? 'Connecting…' : 'Not connected';

  return h('div', {},
    h('div', { class: 'group' },
      h('div', { class: 'card' },
        row('Status', null, h('span', { class: 'row__value', text: statusText })),
        row('Round trip', 'Phone → PC → phone', h('span', { class: 'row__value', text: ms(link.rtt) })),
        row('Cursor delay', 'Estimated, PC sample → phone', h('span', { class: 'row__value', text: ms(link.latency) })),
        row('Cursor updates', null, h('span', { class: 'row__value', text: `${Math.round(link.cursorRate)}/s` })),
        row('Shares cursor', null, h('span', { class: 'row__value', text: shared.cursor === false ? 'Off' : 'Yes' })),
      ),
    ),
    h('div', { class: 'group' },
      h('p', { class: 'group__title', text: 'What your PC shares' }),
      h('div', { class: 'card' },
        ...catalog.map((c) => row(c.label, c.description ?? null,
          h('span', { class: 'row__value', text: shared[c.key] ? factText(c.key, facts[c.key]) ?? 'Waiting…' : 'Not shared' }))),
      ),
      h('p', { class: 'lead', text: 'Change these in the companion window on your PC. Screen contents and keystrokes are never read.' }),
    ),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn btn--ghost', type: 'button', text: 'Reconnect now', onclick: onRetry }),
      h('button', { class: 'btn btn--ghost', type: 'button', text: 'Forget this PC', onclick: onForget }),
    ),
  );
}

export function settingsSheet({ settings, onSetting, onPairTap, pcLabel, version }) {
  return h('div', {},
    h('div', { class: 'group' },
      h('p', { class: 'group__title', text: 'Eyes' }),
      h('div', { class: 'card' },
        row('Gaze style', 'Mirror = eyes copy your cursor. Or say where the phone sits (left of, below, right of your screen) so it looks at your monitor.',
          segmented([['mirror', 'Mirror'], ['left', 'Left'], ['below', 'Below'], ['right', 'Right']], settings.gazeMode, (v) => onSetting('gazeMode', v), 'Gaze style'), { stack: true }),
        row('Multiple monitors', null,
          segmented([['all', 'All screens'], ['current', 'Current screen']], settings.screens, (v) => onSetting('screens', v), 'Monitor mapping'), { stack: true }),
        row('Demo cursor', 'Pretend cursor for when no PC is linked', toggle(settings.demo, (v) => onSetting('demo', v), 'Demo cursor')),
      ),
    ),
    h('div', { class: 'group' },
      h('p', { class: 'group__title', text: 'Look' }),
      h('div', { class: 'card' },
        row('Pet style', 'Clay = soft 3D lighting (WebGL). Classic = the original flat look, lighter on battery.',
          segmented([['auto', 'Auto'], ['clay', 'Clay 3D'], ['classic', 'Classic']], settings.look, (v) => onSetting('look', v), 'Pet style'), { stack: true }),
      ),
    ),
    h('div', { class: 'group' },
      h('p', { class: 'group__title', text: 'Comfort' }),
      h('div', { class: 'card' },
        row('Reduce motion', 'Calmer bouncing and idle wandering', toggle(settings.reducedMotion, (v) => onSetting('reducedMotion', v), 'Reduce motion')),
        row('Sounds', null, toggle(settings.sound, (v) => onSetting('sound', v), 'Sounds')),
        row('Keep screen on', 'Best effort while the pet is open', toggle(settings.awake, (v) => onSetting('awake', v), 'Keep screen on')),
        row('Show link stats', 'Latency and frame-rate overlay', toggle(settings.debug, (v) => onSetting('debug', v), 'Show link stats')),
      ),
    ),
    h('div', { class: 'group' },
      h('p', { class: 'group__title', text: 'PC link' }),
      h('div', { class: 'card' },
        row(pcLabel, null, h('button', { class: 'btn btn--ghost', type: 'button', text: 'Manage', onclick: onPairTap })),
      ),
      h('p', { class: 'lead', text: `Peek Pets ${version}. Your pet lives on this phone. The PC link stays on your Wi-Fi and needs no account.` }),
    ),
  );
}

export function petsSheet({ species, current, bonds, onPick, mountPreview }) {
  const grid = h('div', { class: 'pets' });
  for (const s of species) {
    const canvas = h('canvas', { width: '240', height: '240', 'aria-hidden': 'true' });
    const lvl = bonds[s.id]?.level;
    grid.append(h('button', {
      class: 'pet-card', type: 'button', 'aria-pressed': String(s.id === current), 'aria-label': `${s.name}: ${s.blurb}`,
      onclick: () => onPick(s.id),
    }, canvas, h('b', { text: s.name }), h('small', { text: s.blurb }),
    s.isNew && !lvl ? h('span', { class: 'tag', text: 'NEW' }) : lvl ? h('small', { text: `Lv ${lvl}` }) : null));
    mountPreview(canvas, s);
  }
  return h('div', {}, h('p', { class: 'lead', text: 'Everyone watches your cursor. Pick a friend.' }), grid);
}
