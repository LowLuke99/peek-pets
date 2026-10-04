// Pairing inside the native iPhone app: "pick your PC" from a Bonjour scan, or type its
// address / paste the companion's link, then confirm with the code it shows.

import { h } from './dom.js';
import { normalizeCode, parsePairTarget } from '../core/protocol.js';

/**
 * @param {{error?: string, discover: () => Promise<Array<{pc: string, host: string}>>,
 *          onPair: (host: string, code: string) => void, onDemo: () => void, lastHost?: string}} opts
 */
export function nativePairSheet({ error, discover, onPair, onDemo, lastHost }) {
  let chosen = lastHost ?? null;
  const list = h('div', { class: 'pcs', role: 'listbox', 'aria-label': 'PCs on this Wi-Fi' });
  const status = h('p', { class: 'pnote', role: 'status', text: 'Looking for PCs on this Wi-Fi…' });
  const address = h('input', { class: 'ptext ptext--line', placeholder: '10.0.0.206 or paste the link', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'PC address or link',
    oninput: () => {
      const t = parsePairTarget(address.value);
      if (t.code) code.value = `${t.code.slice(0, 3)}-${t.code.slice(3)}`;
      if (t.host) select(t.host);
    } });
  const code = h('input', { class: 'code-input', inputmode: 'text', autocomplete: 'one-time-code', autocapitalize: 'characters', spellcheck: 'false', maxlength: '7', placeholder: 'ABC-123', 'aria-label': 'Pairing code',
    oninput: (e) => { const c = normalizeCode(e.target.value); e.target.value = c.length > 3 ? `${c.slice(0, 3)}-${c.slice(3)}` : c; } });
  const problem = h('p', { class: 'error', role: 'alert', text: error ?? '', hidden: !error });

  function select(host) {
    chosen = host;
    for (const b of list.children) b.setAttribute('aria-selected', String(b.dataset.host === host));
  }

  async function scan() {
    status.textContent = 'Looking for PCs on this Wi-Fi…';
    const found = await discover();
    list.replaceChildren(...found.map((p) => h('button', {
      class: 'pc', type: 'button', role: 'option', 'data-host': p.host, 'aria-selected': String(p.host === chosen),
      onclick: () => select(p.host),
    }, h('b', { text: `💻  ${p.pc}` }), h('small', { text: p.host }))));
    if (found.length === 1 && !chosen) select(found[0].host);
    status.textContent = found.length ? 'Tap your PC, then type the code it shows.' : 'No PC found yet. Is Peek Pets Companion open on the same Wi-Fi? You can also type its address below.';
  }

  async function submit() {
    const typed = parsePairTarget(address.value);
    const host = typed.host ?? chosen;
    const c = normalizeCode(code.value) || typed.code;
    problem.hidden = true;
    if (!host) return fail('Pick your PC above, or type the address shown in the companion window.');
    if (!c || c.length !== 6) return fail('Type the 6-character code from the companion window.');
    if (!(await reachable(host))) return fail(`Couldn't reach ${host}. Same Wi-Fi? Is the companion running?`);
    onPair(host, c);
  }

  function fail(text) {
    problem.textContent = text;
    problem.hidden = false;
  }

  scan();
  return h('div', {},
    h('p', { class: 'lead', text: 'Open Peek Pets Companion on your PC. It shows up here when you\'re on the same Wi-Fi.' }),
    list, status,
    h('div', { class: 'prow' }, address, h('button', { class: 'pbtn', type: 'button', text: 'Rescan', onclick: scan })),
    code, problem,
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', type: 'button', text: 'Pair', onclick: submit }),
      h('button', { class: 'btn btn--ghost', type: 'button', text: 'Play solo (demo)', onclick: onDemo })));
}

/** Is a Peek Pets companion answering at this address? */
async function reachable(host) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3500);
  try {
    const res = await fetch(`http://${host}/api/info`, { signal: ctrl.signal });
    return res.ok && (await res.json()).app === 'peek-pets';
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
