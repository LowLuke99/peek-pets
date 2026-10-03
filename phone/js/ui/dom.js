// Minimal DOM builder. Text always goes through textContent (never innerHTML) so
// strings from the PC (its name, "say" messages) can't inject markup.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key === 'checked' || key === 'value') el[key] = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export const $ = (sel) => document.querySelector(sel);

export function row(label, sub, control) {
  return h('div', { class: 'row' }, h('div', {}, label, sub ? h('small', { text: sub }) : null), control);
}

export function toggle(checked, onChange, label) {
  return h('input', {
    type: 'checkbox', class: 'switch', role: 'switch', checked, 'aria-label': label,
    onchange: (e) => onChange(e.target.checked),
  });
}

export function segmented(options, value, onChange, label) {
  const wrap = h('div', { class: 'seg', role: 'group', 'aria-label': label });
  for (const [val, text] of options) {
    wrap.append(h('button', {
      type: 'button', 'aria-pressed': String(val === value), text,
      onclick: () => {
        for (const b of wrap.children) b.setAttribute('aria-pressed', 'false');
        wrap.querySelector(`[data-v="${val}"]`)?.setAttribute('aria-pressed', 'true');
        onChange(val);
      },
      'data-v': val,
    }));
  }
  return wrap;
}
